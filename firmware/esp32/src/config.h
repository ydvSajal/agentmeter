#pragma once
#define FW_VERSION "0.1-f3f4"

// Pins (ESP32-S3 DevKitC-1)
constexpr int PIN_SDA = 8;
constexpr int PIN_SCL = 9;
constexpr int PIN_RELAY = 4;
constexpr int PIN_BUTTON = 0;  // BOOT button, active-LOW
constexpr bool RELAY_ACTIVE_LOW = true;  // flip if the relay board is active-high

constexpr uint32_t HEARTBEAT_MS = 5000;   // docs/API.md §2
constexpr uint32_t WS_RECONNECT_MS = 3000;
constexpr time_t MIN_VALID_EPOCH = 1700000000;  // clock counts as NTP-synced above this
#define TZ_INFO "IST-5:30"  // clock screen timezone (POSIX TZ string)
