/** Composition root: parse config, build ports (fake or real), start HTTP + device WebSocket. */
import { serve } from "@hono/node-server";
import { createDb, createRepos } from "@agentmeter/db";
import { generateSeedBase64, publicKeyFromSeedBase64 } from "@agentmeter/shared";
import { ConfigError, loadConfig } from "./config";
import { createGateway } from "./gateway";
import { createLogger } from "./logger";
import { buildPorts } from "./ports";

async function main() {
  const config = loadConfig();
  const log = createLogger(config.env.LOG_LEVEL);
  const ports = buildPorts(config); // throws if a requested real adapter is not wired
  const db = createDb(config.env.DATABASE_URL);
  const repos = createRepos(db);

  // Receipt key. Fake-only dev runs may use an ephemeral key; the device must then pin the printed public key.
  let seed = config.env.RECEIPT_SIGNING_KEY_ED25519;
  if (!seed) {
    if (Object.values(config.adapters).includes("real")) {
      throw new ConfigError("RECEIPT_SIGNING_KEY_ED25519 is required when any real adapter is enabled (node packages/shared/scripts/gen-keys.ts)");
    }
    seed = generateSeedBase64();
    log.warn({ publicKeyBase64: publicKeyFromSeedBase64(seed) }, "RECEIPT_SIGNING_KEY_ED25519 not set: using an EPHEMERAL dev key; devices must pin this public key");
  }

  const { app, hub, orchestrator } = createGateway({ config, ports, repos, log, receiptSeedBase64: seed });
  hub.startSweeper();
  // Before serving: pending payments were in memory, so no unsettled session from a previous run can settle.
  await orchestrator.recoverOrphans();
  setInterval(() => void orchestrator.expireStaleStepUps(), 30_000).unref();

  const server = serve({ fetch: app.fetch, port: config.env.PORT }, (info) =>
    log.info({ port: info.port, adapters: config.adapters }, "gateway listening"),
  );
  server.on("upgrade", hub.handleUpgrade); // devices connect outbound: ws://<host>/devices/:id?token=
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof ConfigError ? `config error: ${err.message}` : err);
  process.exit(1);
});
