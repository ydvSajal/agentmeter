// AgentMeter firmware F3+F4: WiFi + NTP + WebSocket link to the gateway (hello, 5s heartbeat,
// auto-reconnect). Receipts are logged and NOT acted on yet (F5); the relay stays OFF.
#include <Arduino.h>
#include <Wire.h>
#include <time.h>
#include <U8g2lib.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "config.h"
#include "secrets.h"

U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);
WebSocketsClient ws;

bool relayOn = false;  // F5/F6 will drive this
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
static bool synced() { return time(nullptr) > MIN_VALID_EPOCH; }

static void sendJson(JsonDocument &d) {
  String s;
  serializeJson(d, s);
  ws.sendTXT(s);
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

static void onWs(WStype_t t, uint8_t *p, size_t n) {
  if (t == WStype_CONNECTED) {
    wsUp = true;
    Serial.println("[ws] connected");
    sendHello();
    sendHeartbeat();
    lastHb = millis();
  } else if (t == WStype_DISCONNECTED) {
    if (wsUp) Serial.println("[ws] disconnected");
    wsUp = false;
  } else if (t == WStype_TEXT) {
    JsonDocument d;
    if (deserializeJson(d, p, n)) return;
    const char *type = d["type"] | "";
    if (!strcmp(type, "cancel")) setRelay(false);  // safe direction, always honoured
    else if (!strcmp(type, "receipt")) Serial.println("[ws] receipt received (F5 not implemented: ignored, no ack)");
  }
}

static void drawStatus() {
  const bool up = WiFi.status() == WL_CONNECTED;
  char a[24], b[24], c[24];
  snprintf(a, sizeof a, "wifi: %s", up ? WiFi.localIP().toString().c_str() : "connecting...");
  snprintf(b, sizeof b, "time: %s", synced() ? "synced" : "waiting NTP");
  snprintf(c, sizeof c, "gateway: %s", wsUp ? "online" : "offline");
  oled.clearBuffer();
  oled.setFont(u8g2_font_6x12_tr);
  oled.drawStr(0, 10, "AgentMeter " FW_VERSION);
  oled.drawStr(0, 24, a);
  oled.drawStr(0, 38, b);
  oled.drawStr(0, 52, c);
  oled.drawStr(0, 63, relayOn ? "relay: ON" : "relay: OFF");
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
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  for (Star &st : stars) st = {(float)random(0, 128), (float)random(0, 64), 0.05f + random(0, 30) / 100.0f};
  pinMode(PIN_RELAY, OUTPUT);
  setRelay(false);  // boot state is always OFF
  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL);
  oled.begin();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  configTzTime(TZ_INFO, "pool.ntp.org", "time.google.com");  // time() stays UTC; TZ only affects the clock screen
}

void loop() {
  // Start the socket only once WiFi is up and the clock is NTP-synced (receipts need the clock).
  if (!wsStarted && WiFi.status() == WL_CONNECTED && synced()) {
    ws.begin(GATEWAY_HOST, GATEWAY_PORT, "/devices/" DEVICE_ID "?token=" DEVICE_TOKEN);
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
