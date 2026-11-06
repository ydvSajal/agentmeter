/**
 * Simulated ESP32 (CLI). Run: pnpm --filter @agentmeter/gateway sim:device
 *
 * Env:
 *  GATEWAY_WS      ws://localhost:8787
 *  DEVICE_ID       d1               DEVICE_TOKEN dev-token-d1      DEVICE_HMAC dev-hmac-d1
 *  PUBLIC_KEY_BASE64  receipt public key to pin (from gen-keys.ts)
 *  SIM_MODE        normal | silent (never acks) | reject (always nacks) | replay (acks, then reuses nonce)
 */
import { startSimDevice, type SimMode } from "./sim-core";

const pub = process.env.PUBLIC_KEY_BASE64;
if (!pub) {
  console.error("PUBLIC_KEY_BASE64 is required (node packages/shared/scripts/gen-keys.ts)");
  process.exit(1);
}

const dev = startSimDevice({
  url: process.env.GATEWAY_WS ?? "ws://localhost:8787",
  id: process.env.DEVICE_ID ?? "d1",
  token: process.env.DEVICE_TOKEN ?? "dev-token-d1",
  secret: process.env.DEVICE_HMAC ?? "dev-hmac-d1",
  pub,
  mode: (process.env.SIM_MODE ?? "normal") as SimMode,
  log: (l) => console.log(l),
});

dev.ready.catch((e: Error) => {
  console.error(`[sim] could not connect: ${e.message}`);
  process.exit(1);
});
void dev.closed.then((code) => {
  console.log(`[sim] disconnected (${code})`);
  process.exit(0);
});
