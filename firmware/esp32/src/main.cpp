// AgentMeter: verified receipts, persistent replay guard, local relay lease and authenticated ack.
#include <Arduino.h>
#include <Wire.h>
#include <time.h>
#include <sys/time.h>
#include <U8g2lib.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <esp_sntp.h>
#include <esp_timer.h>
#include "receipt.h"
#include "replay-store.h"
#include "gateway-ca.h"
#include "config.h"
#include "secrets.h"

#ifndef RECEIPT_PUBLIC_KEY_BASE64
#define RECEIPT_PUBLIC_KEY_BASE64 ""
#endif
#ifndef DEVICE_HMAC_SECRET
#define DEVICE_HMAC_SECRET ""
#endif
#ifndef WS_TLS
#define WS_TLS false
#endif
#ifndef ALLOW_LOCAL_CLOCK_FALLBACK
#define ALLOW_LOCAL_CLOCK_FALLBACK false
#endif
#ifdef RECEIPT_SELF_TEST
#include "selftest.h"
#endif

U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);
WebSocketsClient ws;

volatile bool relayOn = false;
volatile bool clockReady = false, timerExpired = false;
ReplayStore replayStore;
bool replayReady = false;
RelayLease lease;
esp_timer_handle_t relayTimer = nullptr;
bool wsStarted = false, wsUp = false;
uint32_t lastHb = 0, lastDraw = 0;

// Screen modes, cycled with the BOOT button (GPIO0): status -> clock -> animation -> status.
// The status screen is forced whenever the relay is ON so the live state is never hidden.
enum Mode { M_STATUS, M_CLOCK, M_ANIM };
Mode mode = M_STATUS;
bool lastBtn = true;
uint32_t lastBtnMs = 0;

struct Star { float x, y, v; };
Star stars[28];

static void setRelay(bool on) {
  relayOn = on;
  digitalWrite(PIN_RELAY, (on != RELAY_ACTIVE_LOW) ? HIGH : LOW);
}
static bool synced() { return clockReady && time(nullptr) > MIN_VALID_EPOCH; }
static void stopRelay() {
  setRelay(false);
  if (relayTimer) esp_timer_stop(relayTimer);
  lease.stop();
  timerExpired = false;
}
static void expireRelay(void *) {
  // Runs in the ESP timer task even while HTTP/NVS/WebSocket code blocks loop().
  digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? HIGH : LOW);
  relayOn = false;
  timerExpired = true;
}
static time_t utcEpoch(struct tm &utc) {
  setenv("TZ", "UTC0", 1); tzset();
  const time_t epoch = mktime(&utc);
  setenv("TZ", TZ_INFO, 1); tzset();
  return epoch;
}

// Use a CA-verified HTTPS Date from the configured gateway if NTP is blocked.
// Build time only bootstraps certificate validity and never permits a receipt.
// Plain HTTP is an explicit opt-in for a trusted laptop LAN, never a TLS fallback.
static void syncGatewayClock() {
  static uint32_t lastAttempt = 0;
  if (synced() || WiFi.status() != WL_CONNECTED || millis() - lastAttempt < 10000) return;
  lastAttempt = millis();
  if (!WS_TLS && !ALLOW_LOCAL_CLOCK_FALLBACK) return;
  NetworkClientSecure secure;
  if (WS_TLS) {
    if (time(nullptr) <= MIN_VALID_EPOCH) {
      struct tm built = {};
      if (!strptime(__DATE__ " " __TIME__, "%b %e %Y %H:%M:%S", &built)) return;
      const struct timeval bootstrap = {utcEpoch(built), 0};
      if (settimeofday(&bootstrap, nullptr) != 0) return;
    }
    secure.setCACert(GATEWAY_ROOT_CA);
    secure.setHandshakeTimeout(3);
  }
  HTTPClient http;
  http.setConnectTimeout(1500);
  http.setTimeout(1500);
  const String url = String(WS_TLS ? "https://" : "http://") + GATEWAY_HOST + ":" + GATEWAY_PORT + "/health";
  if (WS_TLS ? !http.begin(secure, url) : !http.begin(url)) return;
  const char *headers[] = {"Date"};
  http.collectHeaders(headers, 1);
  const int status = http.GET();
  const String date = http.header("Date");
  http.end();
  if (status != 200 || date.length() != 29) {
    IPAddress ip;
    const bool dns = WiFi.hostByName(GATEWAY_HOST, ip);
    char tlsErr[100] = "n/a";
    if (WS_TLS) secure.lastError(tlsErr, sizeof(tlsErr));
    Serial.printf("[time] gateway clock sync failed: http %d dns=%d ip=%s dnsServer=%s tls=\"%s\" now=%ld\n", status, (int)dns,
                  ip.toString().c_str(), WiFi.dnsIP().toString().c_str(), tlsErr, (long)time(nullptr));
    return;
  }
  struct tm utc = {};
  const char *end = strptime(date.c_str(), "%a, %d %b %Y %H:%M:%S GMT", &utc);
  if (!end || *end || utc.tm_year < 123 || utc.tm_year > 200) return;
  const time_t epoch = utcEpoch(utc);
  if (epoch <= MIN_VALID_EPOCH) return;
  const struct timeval clock = {epoch, 0};
  if (settimeofday(&clock, nullptr) == 0) {
    clockReady = true;
    Serial.println(WS_TLS ? "[time] synced from verified HTTPS gateway" : "[time] synced from trusted LAN gateway");
  }
}

static void sendJson(JsonDocument &d) {
  String s;
  serializeJson(d, s);
  ws.sendTXT(s);
}
static String encodedToken(const String &token) {
  const char hex[] = "0123456789ABCDEF";
  String result;
  for (uint8_t c : token) {
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
        c == '-' || c == '_' || c == '.' || c == '~') result += static_cast<char>(c);
    else { result += '%'; result += hex[c >> 4]; result += hex[c & 15]; }
  }
  return result;
}
static void sendHello() {
  JsonDocument d;
  d["type"] = "hello"; d["deviceId"] = DEVICE_ID; d["fw"] = FW_VERSION; d["ts"] = (long)time(nullptr);
  sendJson(d);
}
static void sendHeartbeat() {
  JsonDocument d;
  d["type"] = "heartbeat"; d["deviceId"] = DEVICE_ID; d["relay"] = relayOn; d["ts"] = (long)time(nullptr);
  sendJson(d);
}

static void rejectReceipt(const Receipt &r, const char *reason) {
  stopRelay();
  JsonDocument d;
  d["type"] = "nack"; d["sessionId"] = r.sessionId; d["nonce"] = r.nonce; d["reason"] = reason;
  sendJson(d);
  sendHeartbeat();
  Serial.printf("[receipt] rejected: %s\n", reason);
}
static void acceptReceipt(JsonDocument &frame) {
  Receipt r;
  if (!parseReceipt(frame["receipt"], r) || !frame["sig"].is<const char *>()) return rejectReceipt(r, "signature");
  const int64_t now = time(nullptr);
  const char *reason = verifyReceipt(r, frame["sig"].as<String>(), RECEIPT_PUBLIC_KEY_BASE64,
    DEVICE_ID, now, synced(), [](const String &nonce) { return replayStore.contains(nonce); });
  if (reason) return rejectReceipt(r, reason);
  // The skew window permits verification, but never adds paid running time.
  if (now >= r.expiresAt) return rejectReceipt(r, "expired");
  if (lease.active || !replayReady || !relayTimer || String(DEVICE_HMAC_SECRET).isEmpty()) return rejectReceipt(r, "signature");
  const String mac = acknowledgementMac(DEVICE_HMAC_SECRET, r, now);
  if (mac.isEmpty() || !replayStore.remember(r.nonce)) return rejectReceipt(r, "signature");
  // Persist replay protection before actuation. Failure consumes no free usage.
  if (!lease.begin(r, time(nullptr), millis())) return rejectReceipt(r, "expired");
  timerExpired = false;
  struct timeval current;
  gettimeofday(&current, nullptr);
  const int64_t remainingUs = (r.expiresAt - current.tv_sec) * 1000000 - current.tv_usec;
  if (remainingUs <= 0) return rejectReceipt(r, "expired");
  if (esp_timer_start_once(relayTimer, static_cast<uint64_t>(remainingUs)) != ESP_OK)
    return rejectReceipt(r, "signature");
  setRelay(true);
  JsonDocument ack;
  ack["type"] = "ack"; ack["sessionId"] = r.sessionId; ack["nonce"] = r.nonce;
  ack["relay"] = true; ack["ts"] = now; ack["mac"] = mac;
  sendJson(ack);
  sendHeartbeat();
  Serial.println("[receipt] verified, replay guard saved, relay ON, authenticated ack sent");
}

static void onWs(WStype_t t, uint8_t *p, size_t n) {
  if (t == WStype_CONNECTED) {
    stopRelay();  // reconnect never resumes a lease from an earlier connection
    wsUp = true;
    Serial.println("[ws] connected");
    sendHello();
    sendHeartbeat();
    lastHb = millis();
  } else if (t == WStype_DISCONNECTED) {
    stopRelay();
    if (wsUp) Serial.println("[ws] disconnected");
    wsUp = false;
  } else if (t == WStype_TEXT) {
    if (n > 2048) { stopRelay(); return; }
    JsonDocument d;
    if (deserializeJson(d, p, n)) { stopRelay(); return; }
    const char *type = d["type"] | "";
    if (!strcmp(type, "cancel") && d["sessionId"].as<String>() == lease.sessionId) {
      stopRelay(); sendHeartbeat();
    } else if (!strcmp(type, "receipt")) acceptReceipt(d);
  }
}

static void drawStatus() {
  const bool up = WiFi.status() == WL_CONNECTED;
  oled.clearBuffer();
  oled.setFont(u8g2_font_5x7_tr);
  oled.drawStr(0, 8, "AGENTMETER");
  const String device = String(DEVICE_ID).substring(0, 12);
  oled.drawStr(128 - oled.getStrWidth(device.c_str()), 8, device.c_str());
  oled.drawHLine(0, 12, 128);
  if (relayOn && lease.active) {
    // One large number is readable on the 0.9-inch 128x64 panel.
    const uint32_t elapsed = millis() - lease.startedMs;
    const uint32_t monoSec = elapsed >= lease.durationMs ? 0 : (lease.durationMs - elapsed + 999) / 1000;
    const int64_t wallSec = max<int64_t>(0, lease.expiresAt - time(nullptr));
    const unsigned seconds = static_cast<unsigned>(min<int64_t>(wallSec, monoSec));
    char remaining[12];
    snprintf(remaining, sizeof remaining, "%02u:%02u", seconds / 60, seconds % 60);
    oled.setFont(u8g2_font_logisoso24_tn);
    oled.drawStr((128 - oled.getStrWidth(remaining)) / 2, 42, remaining);
    oled.setFont(u8g2_font_6x10_tr);
    oled.drawStr(0, 62, "RELAY ON");
    oled.drawStr(88, 62, "PAID");
    const uint32_t width = lease.durationMs ? static_cast<uint64_t>(monoSec) * 1000 * 128 / lease.durationMs : 0;
    oled.drawBox(0, 47, min<uint32_t>(128, width), 2);
  } else {
    const bool provisioned = !String(RECEIPT_PUBLIC_KEY_BASE64).isEmpty() && !String(DEVICE_HMAC_SECRET).isEmpty();
    const char *state = !up ? "WIFI WAIT" : !synced() ? "TIME SYNC" : !wsUp ? "CONNECTING" : !provisioned || !replayReady ? "KEYS NEEDED" : "READY";
    oled.setFont(u8g2_font_helvB12_tr);
    oled.drawStr((128 - oled.getStrWidth(state)) / 2, 34, state);
    oled.setFont(u8g2_font_5x7_tr);
    oled.drawStr(0, 47, "RELAY OFF / LOCKED");
    oled.drawStr(0, 62, up ? "WIFI OK" : "WIFI --");
    oled.drawStr(49, 62, wsUp ? (WS_TLS ? "GW TLS" : "GW OK") : "GW --");
    oled.drawStr(92, 62, synced() ? "TIME OK" : "TIME --");
  }
  oled.sendBuffer();
}

static void drawClock() {
  struct tm t;
  char hm[12], sec[8], day[24];
  const bool ok = synced() && getLocalTime(&t, 0);
  if (ok) {
    strftime(hm, sizeof hm, "%H:%M", &t);
    strftime(sec, sizeof sec, ":%S", &t);
    strftime(day, sizeof day, "%a %d %b %Y", &t);
  } else {
    snprintf(hm, sizeof hm, "--:--"); sec[0] = 0; snprintf(day, sizeof day, "waiting for NTP");
  }
  oled.clearBuffer();
  oled.setFont(u8g2_font_logisoso28_tn);
  oled.drawStr(2, 40, hm);
  oled.setFont(u8g2_font_6x12_tr);
  oled.drawStr(104, 40, sec);
  oled.drawStr(0, 62, day);
  oled.sendBuffer();
}

static void drawAnim() {  // starfield flying toward the viewer
  oled.clearBuffer();
  for (Star &s : stars) {
    s.x += (s.x - 64) * s.v * 0.08f; s.y += (s.y - 32) * s.v * 0.08f; s.v += 0.01f;
    if (s.x < 0 || s.x > 127 || s.y < 0 || s.y > 63) {
      s.x = 64 + (random(-100, 100) / 100.0f) * 6; s.y = 32 + (random(-100, 100) / 100.0f) * 4; s.v = 0.05f + random(0, 30) / 100.0f;
    }
    oled.drawPixel((int)s.x, (int)s.y);
    if (s.v > 0.35f) oled.drawPixel((int)s.x + 1, (int)s.y);
  }
  oled.setFont(u8g2_font_5x7_tr);
  oled.drawStr(40, 62, "AgentMeter");
  oled.sendBuffer();
}

static void handleButton() {
  const bool b = digitalRead(PIN_BUTTON);
  if (lastBtn && !b && millis() - lastBtnMs > 200) {  // falling edge, 200ms debounce
    mode = (Mode)((mode + 1) % 3);
    lastBtnMs = millis();
  }
  lastBtn = b;
  if (relayOn) mode = M_STATUS;
}

void setup() {
  digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? HIGH : LOW);
  pinMode(PIN_RELAY, OUTPUT);
  setRelay(false);  // OFF before OLED, Wi-Fi, storage or any other initialization
  // Addressable LEDs retain their colour across MCU resets; explicitly clear it.
  rgbLedWrite(RGB_BUILTIN, 0, 0, 0);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  for (Star &st : stars) st = {(float)random(0, 128), (float)random(0, 64), 0.05f + random(0, 30) / 100.0f};
  Serial.begin(115200);
#ifdef RECEIPT_SELF_TEST
  delay(1500);
  runReceiptSelfTests();
  return;
#endif
  replayReady = replayStore.begin();
  if (!replayReady) Serial.println("[receipt] replay storage unavailable: relay locked OFF");
  const esp_timer_create_args_t timerArgs = { .callback = expireRelay, .arg = nullptr,
    .dispatch_method = ESP_TIMER_TASK, .name = "relay-off", .skip_unhandled_events = true };
  if (esp_timer_create(&timerArgs, &relayTimer) != ESP_OK) relayTimer = nullptr;
  enableLoopWDT();
  Wire.begin(PIN_SDA, PIN_SCL);
  oled.begin();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  sntp_set_time_sync_notification_cb([](struct timeval *) { clockReady = true; });
  configTzTime(TZ_INFO, "pool.ntp.org", "time.google.com");  // time() stays UTC; TZ only affects the clock screen
}

void loop() {
#ifdef RECEIPT_SELF_TEST
  delay(1000);
  return;
#endif
  if (timerExpired || lease.expired(time(nullptr), millis())) { stopRelay(); if (wsUp) sendHeartbeat(); }
  if (WiFi.status() != WL_CONNECTED && lease.active) stopRelay();
  // Onboard RGB LED mirrors the relay so activation is visible with no load attached: green = paid access on.
  // Updated here, not in the timer callback, because the LED driver is not safe to call from the timer task.
  static bool ledOn = false;
  if (relayOn != ledOn) {
    ledOn = relayOn;
    rgbLedWrite(RGB_BUILTIN, 0, ledOn ? 60 : 0, 0);
  }
  // Windows Mobile Hotspot (ICS) can hand out a lease with no DNS server, so neither NTP nor the gateway
  // host name resolves. Keep the leased IP and add public resolvers once per connection.
  static bool dnsPatched = false;
  if (WiFi.status() != WL_CONNECTED) dnsPatched = false;
  else if (!dnsPatched && WiFi.dnsIP() == IPAddress(0, 0, 0, 0)) {
    dnsPatched = true;
    WiFi.config(WiFi.localIP(), WiFi.gatewayIP(), WiFi.subnetMask(), IPAddress(8, 8, 8, 8), IPAddress(1, 1, 1, 1));
    Serial.println("[net] no DNS from DHCP: using 8.8.8.8 / 1.1.1.1");
  }
  syncGatewayClock();
  static uint32_t lastDiag = 0;
  if (millis() - lastDiag >= 10000) {  // one line every 10s so a silent board is diagnosable over serial
    lastDiag = millis();
    Serial.printf("[diag] wifi=%d rssi=%d ip=%s synced=%d ws=%d relay=%d\n", (int)WiFi.status(), WiFi.RSSI(),
                  WiFi.localIP().toString().c_str(), (int)synced(), (int)wsUp, (int)lease.active);
  }
  // Start the socket only once WiFi is up and the clock is NTP-synced (receipts need the clock).
  if (!wsStarted && WiFi.status() == WL_CONNECTED && synced()) {
    const String path = String("/devices/") + DEVICE_ID + "?token=" + encodedToken(DEVICE_TOKEN);
    if (WS_TLS) ws.beginSslWithCA(GATEWAY_HOST, GATEWAY_PORT, path.c_str(), GATEWAY_ROOT_CA);
    else ws.begin(GATEWAY_HOST, GATEWAY_PORT, path.c_str());
    ws.onEvent(onWs);
    ws.setReconnectInterval(WS_RECONNECT_MS);
    wsStarted = true;
    Serial.printf("[ws] connecting to %s:%d\n", GATEWAY_HOST, GATEWAY_PORT);
  }
  if (wsStarted) ws.loop();
  if (wsUp && millis() - lastHb >= HEARTBEAT_MS) { sendHeartbeat(); lastHb = millis(); }
  handleButton();
  const uint32_t every = mode == M_ANIM ? 40 : mode == M_CLOCK ? 200 : 500;
  if (millis() - lastDraw >= every) {
    lastDraw = millis();
    if (mode == M_CLOCK) drawClock(); else if (mode == M_ANIM) drawAnim(); else drawStatus();
  }
}
