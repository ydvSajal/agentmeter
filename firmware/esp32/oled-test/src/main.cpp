// OLED smoke test: scans I2C, shows status + a looping demo countdown, keeps the relay pin OFF.
// Wiring (ESP32-S3 DevKitC-1): OLED SDA->GPIO8, SCK(SCL)->GPIO9, VCC->3V3, GND->GND. Relay IN->GPIO4.
#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <WiFi.h>
#include "secrets.h"

constexpr int PIN_SDA = 8;
constexpr int PIN_SCL = 9;
constexpr int PIN_RELAY = 4;
constexpr bool RELAY_ACTIVE_LOW = true;  // most relay boards; flip if yours is active-high

#ifdef OLED_SH1106
U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);
#else
U8G2_SSD1306_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);
#endif

static void relay(bool on) { digitalWrite(PIN_RELAY, (on != RELAY_ACTIVE_LOW) ? HIGH : LOW); }

void setup() {
  pinMode(PIN_RELAY, OUTPUT);
  relay(false);  // boot state is always OFF
  Serial.begin(115200);
  delay(1500);

  Wire.begin(PIN_SDA, PIN_SCL);
  Serial.println("I2C scan:");
  int found = 0;
  for (uint8_t a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { Serial.printf("  device at 0x%02X\n", a); found++; }
  }
  if (!found) Serial.println("  none: check SDA/SCK/VCC/GND wiring");

  oled.begin();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);  // rejoin after hotspot drops or reboots
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("WiFi: joining %s\n", WIFI_SSID);
}

void loop() {
  relay(false);  // this test never switches the relay
  const bool up = WiFi.status() == WL_CONNECTED;
  char l2[24], l3[24], l4[24];
  snprintf(l2, sizeof l2, "wifi: %s", up ? "connected" : "connecting...");
  snprintf(l3, sizeof l3, "ip: %s", up ? WiFi.localIP().toString().c_str() : "-");
  snprintf(l4, sizeof l4, "relay OFF  rssi %d", up ? WiFi.RSSI() : 0);

  oled.clearBuffer();
  oled.setFont(u8g2_font_6x12_tr);
  oled.drawStr(0, 10, "AgentMeter");
  oled.drawStr(0, 24, l2);
  oled.drawStr(0, 38, l3);
  oled.drawStr(0, 52, l4);
  oled.sendBuffer();
  delay(500);
}
