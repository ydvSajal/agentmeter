#pragma once
// Copy to secrets.h (git-ignored). WiFi must be 2.4 GHz.
#define WIFI_SSID "your-hotspot-name"
#define WIFI_PASS "your-hotspot-password"
#define GATEWAY_HOST "192.168.x.x"  // laptop IP on the same network
#define GATEWAY_PORT 8787
#define DEVICE_ID "d1"
#define DEVICE_TOKEN "dev-token-d1"
// Pin the PUBLIC key matching RECEIPT_SIGNING_KEY_ED25519 on the gateway.
// Empty/missing credentials fail closed: the device cannot energize the relay.
#define RECEIPT_PUBLIC_KEY_BASE64 ""
#define DEVICE_HMAC_SECRET ""
// Render: host without a scheme, port 443, WS_TLS true.
#define WS_TLS false
// Explicitly permit the laptop's HTTP Date fallback only on a trusted local LAN.
#define ALLOW_LOCAL_CLOCK_FALLBACK true
