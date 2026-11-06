# Agent B: firmware, web and docs

Branch: `agent-b/firmware-web-docs`. Backend/web3 implementation belongs to Agent A.

## Delivered in source

- Firmware Ed25519 verification, HMAC ack, 32-entry persistent replay history,
  independent relay-off timer, monotonic deadline, watchdog and safe reconnect.
- `WS_TLS` path with certificate verification; NTP and gateway-clock fallback.
- On-board self-test build generated from the shared receipt vectors; exact ack
  MAC and lease/persistence tests. Hardware results are recorded separately.
- Firmware setup/acceptance guide, World debrief scaffold, architecture SVG and
  current README with the six-step flow and explicit evidence gaps.

## Agent A integration requests

1. Provide the approval-page provider URL retrieval contract. Frontend currently
   requires `POST /stepup/:sessionId/start -> {authorizeUrl}`; gateway lacks it.
2. Pin a stable gateway receipt key. Supply only its public key to the firmware.
   Device token/HMAC must match the Render/Neon device row; configure privately.
3. Set `WORLD_REDIRECT_URI=https://agentmeter-jet.vercel.app/api/world/callback`
   in the gateway and register that exact callback with World.
4. Preserve canonical receipt fields and ack MAC from `docs/API.md`. Firmware
   rejects a second concurrent lease and any receipt with no remaining paid time.
5. Add genuine Hedera tx IDs, HCS topic/seq, 0G request IDs and Storage roots to
   README evidence after running the real adapters. Current deployment uses fakes.

## Owner inputs remaining

- Confirm relay GPIO4, active-low polarity and a low-voltage load before actuation.
- Production device token/HMAC and gateway public signing key.
- Render Starter upgrade needs spend approval; Agent B does not change billing.
- Resend key/recipient are optional. No email activation without those inputs.

## Verification log

- Both firmware environments compiled. On-board `receipt-selftest` flashed with
  verified hash and passed **24/24** cases on COM3, relay OFF.
- Frontend TypeScript, 28 tests and final production build passed, including the
  17 public guides and their Markdown download routes (42 generated pages).
- Vercel production redeploy completed Ready with live gateway variables. `/`,
  `/devices`, `/docs` and `/docs/api/raw` returned HTTP 200; dashboard HTML reports
  Live gateway, no fixture-mode label. Browser runtime was unavailable.
- Render `/health` returned `ok:true`, `db:ok`, all external adapters fake.
- Normal firmware with the small-OLED UI flashed successfully and its image hash
  was verified. UI reports WIFI WAIT; Windows hotspot was found OFF. Render's TLS
  chain verifies against only the firmware's GTS Root R4 anchor from the laptop.
  Actual on-board WSS is pending restored Wi-Fi connectivity.
- Physical relay switching and real paid settlement remain unverified.
