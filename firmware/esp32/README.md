# ESP32-S3 device

PlatformIO, Arduino, SH1106 OLED (SDA GPIO8 / SCL GPIO9), relay GPIO4, BOOT GPIO0.
`config.h` defines relay polarity. Confirm it against the actual module before connecting a load.
The RGB LED is cleared on boot; BOOT cycles status, clock and animation.
The small 128×64 display prioritizes large READY / CONNECTING / TIME SYNC / KEYS
NEEDED text, Wi-Fi/gateway/time indicators and an automatic large paid countdown
with a remaining-time bar while the relay is on. KEYS NEEDED means connectivity
works but the public signing key or HMAC has not yet been provisioned.

## Configure and build

Copy `src/secrets.example.h` to ignored `src/secrets.h`. Set Wi-Fi, gateway host/port,
device token, `DEVICE_HMAC_SECRET`, and `RECEIPT_PUBLIC_KEY_BASE64`.
The public key must match the gateway's receipt-signing seed; the HMAC secret must
match the seeded device row. Never copy the gateway private signing seed onto the board.
Missing key/HMAC or failed replay storage keeps the relay OFF.

```powershell
pio run -e esp32-s3
pio device list
pio run -e esp32-s3 -t upload --upload-port COM3
pio device monitor --port COM3 --baud 115200
```

Uploads use 115200 baud because this board's CH343 connection dropped at higher rates.
Close other serial monitors, keep the cable steady, and wait for `Hash of data verified`.
An interrupted upload needs a complete reflash before the OLED can boot again.

## Local gateway and Render

For the laptop: host is its hotspot IPv4 address, port 8787, `WS_TLS false`.
Public NTP is attempted first. Set `ALLOW_LOCAL_CLOCK_FALLBACK true` only on the
trusted laptop LAN to allow the gateway's HTTP Date as the clock source.

For Render:

```cpp
#define GATEWAY_HOST "agentmeter-gateway.onrender.com"
#define GATEWAY_PORT 443
#define WS_TLS true
#define ALLOW_LOCAL_CLOCK_FALLBACK false
```

TLS verifies the gateway certificate using the public Google Trust Services Root R4
anchor in `src/gateway-ca.h` (observed Render certificate issuer: WE1). Refresh it
from Google's repository with `python scripts/fetch-ca.py` when the endpoint's CA
chain changes; never replace verification with `setInsecure()`. The board uses public NTP or the verified
HTTPS Date from its configured gateway. Compiler time may bootstrap certificate
validation but cannot authorize a receipt. No receipt is accepted until fresh time
has been obtained. A sleeping Render free instance may take time to answer.

## Receipt and relay rules

- Reconstruct `AMv1|deviceId|sessionId|nonce|notBefore|expiresAt|amount|payer` exactly.
- Check Ed25519, own device ID, the 30-second verification window and replay history.
- Save the nonce in an atomic NVS blob before switching on. The last 32 nonces survive reboot.
- Never energize for a receipt already past `expiresAt`, even inside signature verification skew.
- Run an ESP timer independent of the network loop plus a monotonic lease deadline.
- Ack with lowercase hex HMAC-SHA256 over `sessionId|nonce|ts`, matching gateway `ws/mac.ts`.
- Send heartbeats every five seconds. Cancel for the active session, disconnect,
  invalid receipt, expiry and boot all leave the relay OFF. Reconnection does not resume a lease.
- A loop watchdog resets a stalled loop. Physical crash safety also depends on
  relay wiring: use a normally-open contact and the appropriate input pull-up/down.

## On-board contract tests

```powershell
pio run -e receipt-selftest -t upload --upload-port COM3
pio device monitor --port COM3 --baud 115200
```

This dedicated build never starts Wi-Fi or energizes the relay. It generates its
cases directly from `packages/shared/test-vectors/receipt.json`, exercises the
real Ed25519 verifier, malformed fields, exact Node-compatible ack MAC, monotonic
expiry/millis wraparound, cancellation and NVS replay persistence. It uses an
isolated `am-selftest` namespace and embeds no private signing key.
Require every `[selftest]` case to PASS, then reflash the normal `esp32-s3` build.

## Hardware acceptance still required

With confirmed GPIO/polarity and a low-voltage load, show: valid signed receipt
switches on and produces a gateway-accepted ack; replay/tamper/wrong-device stay
off; cancel and expiry switch off; reboot does not permit replay; loss of network
cannot extend a lease. Check Render WSS with the actual device credentials.
Software tests cannot establish relay polarity, wiring, or crash behavior electrically.
