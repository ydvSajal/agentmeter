/**
 * Assembles the gateway from already-built parts: device hub + orchestrator + HTTP app.
 * Used by main.ts (real process) and scripts/demo-scenarios.ts (in-process), so both exercise the same wiring.
 */
import type { Repos } from "@agentmeter/db";
import type { Logger } from "pino";
import { createApp } from "./app";
import type { Config } from "./config";
import { Orchestrator, type OrchestratorOptions } from "./core/orchestrator";
import { hbarToTinybar } from "./core/policy";
import type { Ports } from "./ports";
import { DeviceHub } from "./ws/devices";

export interface GatewayInput {
  config: Config;
  ports: Ports;
  repos: Repos;
  log: Logger;
  receiptSeedBase64: string;
  rateLimit?: { max: number; windowSec: number };
  /** Overrides for tests and scenario runs (shorter timeouts etc.). */
  orchestratorOptions?: Partial<OrchestratorOptions>;
}

export function createGateway(i: GatewayInput) {
  const { config, ports, repos, log } = i;
  const hub = new DeviceHub(repos, ports.clock, log);
  const orchestrator = new Orchestrator(repos, ports, hub, log, {
    receiptSeedBase64: i.receiptSeedBase64,
    stepUpThreshold: hbarToTinybar(config.env.STEP_UP_THRESHOLD_HBAR),
    ackTimeoutMs: config.env.ACK_TIMEOUT_MS,
    zgTimeoutMs: config.env.ZG_TIMEOUT_MS,
    ...i.orchestratorOptions,
  });
  const app = createApp({
    log,
    adapters: config.adapters,
    startedAt: ports.clock.now(),
    now: () => ports.clock.now(),
    checkDb: async () => (await repos.ping(), true),
    api: { orchestrator, repos, hub, clock: ports.clock, hederaNetwork: config.env.HEDERA_NETWORK, rateLimit: i.rateLimit },
  });
  return { app, hub, orchestrator };
}
