/**
 * Demo scenarios (PRD §4 + settle failure). Boots the REAL gateway in-process (HTTP routes, WebSocket
 * hub, orchestrator, SQLite) with fake payment/0G/World adapters, connects a simulated ESP32 that
 * verifies receipts like the firmware, and drives every demo case over HTTP.
 *
 * Run: pnpm demo:scenarios          Exit code 1 if any check fails (also runs in CI).
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createDb, createRepos, sha256 } from "@agentmeter/db";
import {
  FakeAuditLog,
  FakeDecider,
  FakeEpisodeStore,
  FakeFacilitator,
  FakeStepUp,
  generateSeedBase64,
  publicKeyFromSeedBase64,
} from "@agentmeter/shared";
import { pino } from "pino";
import { loadConfig } from "../src/config";
import type { ReceiptMessage } from "../src/core/device-channel";
import { createGateway } from "../src/gateway";
import type { Ports } from "../src/ports";
import { startSimDevice, type SimDevice } from "./sim-core";

const DEVICE = { id: "d1", token: "demo-token-d1", secret: "demo-hmac-d1", payTo: "0.0.9" };
const TERMINAL = ["SETTLED", "CANCELLED", "SAFE_STOP"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Check = [label: string, ok: boolean, detail?: string];
let totalChecks = 0;
let failedChecks = 0;

async function main() {
  // ---- boot: temp DB, fake adapters, real gateway on an ephemeral port --------------------------
  const dir = mkdtempSync(join(tmpdir(), "agentmeter-demo-"));
  const dbUrl = `file:${join(dir, "demo.db").replace(/\\/g, "/")}`;
  const dbPkg = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../packages/db");
  execSync("npx prisma db push --skip-generate", { cwd: dbPkg, env: { ...process.env, DATABASE_URL: dbUrl }, stdio: "ignore" });
  const db = createDb(dbUrl);
  const repos = createRepos(db);
  await db.device.create({
    data: { id: DEVICE.id, name: "Demo charger", pricePerMinute: "10000000", payTo: DEVICE.payTo, tokenHash: sha256(DEVICE.token), hmacSecret: DEVICE.secret },
  });
  await db.agent.create({
    data: { id: "a1", name: "Demo agent", hederaAccountId: "0.0.1001", dailyCap: "10000000000", allowedDeviceIds: JSON.stringify([DEVICE.id]) },
  });

  const facilitator = new FakeFacilitator();
  const decider = new FakeDecider();
  const episodes = new FakeEpisodeStore();
  const stepUp = new FakeStepUp();
  const ports: Ports = { facilitator, decider, episodes, audit: new FakeAuditLog(), stepUp, clock: { now: () => Math.floor(Date.now() / 1000) } };
  const seed = generateSeedBase64();
  const pub = publicKeyFromSeedBase64(seed);
  const gw = createGateway({
    config: loadConfig({}),
    ports,
    repos,
    log: pino({ level: "silent" }),
    receiptSeedBase64: seed,
    rateLimit: { max: 1000, windowSec: 60 },
    orchestratorOptions: { ackTimeoutMs: 1500, zgTimeoutMs: 300, settleBackoffMs: 0 },
  });
  let lastReceipt: ReceiptMessage | undefined;
  const realDeliver = gw.hub.deliver.bind(gw.hub);
  gw.hub.deliver = async (id, msg, t) => ((lastReceipt = msg), realDeliver(id, msg, t));

  const port = await new Promise<number>((resolvePort) => {
    const server = serve({ fetch: gw.app.fetch, port: 0 }, (info) => resolvePort(info.port));
    server.on("upgrade", gw.hub.handleUpgrade);
    cleanups.push(() => void server.close());
  });
  const base = `http://localhost:${port}`;

  // ---- helpers ---------------------------------------------------------------------------------
  let sim!: SimDevice; // assigned by connectDevice() before any scenario runs
  let lastHeader = ""; // payment header of scenario 1, reused to prove replay protection in scenario 2
  const connectDevice = async () => {
    sim = startSimDevice({ url: `ws://localhost:${port}`, id: DEVICE.id, token: DEVICE.token, secret: DEVICE.secret, pub, heartbeatMs: 1000 });
    await sim.ready;
    for (let i = 0; i < 100 && !gw.hub.isOnline(DEVICE.id); i++) await sleep(20);
  };
  await connectDevice();

  const http = async (path: string, init?: RequestInit) => {
    const res = await fetch(base + path, init);
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  };
  let n = 0;
  const header = () => `demo-payment-${Date.now()}-${++n}`;
  const rent = (minutes: number, paymentHeader?: string) =>
    http(`/devices/${DEVICE.id}/session`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(paymentHeader ? { "PAYMENT-SIGNATURE": paymentHeader } : {}) },
      body: JSON.stringify({ minutes, agentId: "a1" }),
    });
  /** Wait for a terminal state, then for background logging, then return the final session. */
  const finish = async (sessionId: string) => {
    for (let i = 0; i < 400; i++) {
      const { body } = await http(`/sessions/${sessionId}`);
      if (TERMINAL.includes(body.state)) break;
      await sleep(25);
    }
    await gw.orchestrator.idle();
    return (await http(`/sessions/${sessionId}`)).body;
  };
  const timeline = (s: any) => s.events.map((e: any) => e.state).join(" > ");
  const settleCount = () => facilitator.calls.filter((c) => c === "settle").length;
  const reset = () => {
    decider.mode = "allow";
    facilitator.settleOk = true;
    facilitator.verifyValid = true;
    stepUp.outcome = "APPROVED";
    sim.setMode("normal");
  };

  async function scenario(title: string, run: () => Promise<Check[]>) {
    console.log(`\n${title}`);
    reset();
    let checks: Check[];
    try {
      checks = await run();
    } catch (e) {
      checks = [["scenario ran without an unexpected error", false, (e as Error).message]];
    }
    for (const [label, ok, detail] of checks) {
      totalChecks++;
      if (!ok) failedChecks++;
      console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `   (${detail})` : ""}`);
    }
  }

  // ---- scenarios -------------------------------------------------------------------------------
  await scenario("1. Agent pays and the device unlocks", async () => {
    const unpaid = await rent(1);
    const h = header();
    const r = await rent(1, h);
    const s = await finish(r.body.sessionId);
    lastHeader = h;
    return [
      ["unpaid request gets 402 with price and payTo", unpaid.status === 402 && unpaid.body.accepts?.[0]?.payTo === DEVICE.payTo, `amount ${unpaid.body.accepts?.[0]?.amount}`],
      ["paid request accepted (202)", r.status === 202],
      ["session ends SETTLED", s.state === "SETTLED", timeline(s)],
      ["Hedera transaction id recorded", !!s.hederaTxId, s.hederaTxId],
      ["0G request id recorded", !!s.zgRequestId, s.zgRequestId],
      ["0G Storage root hash recorded", !!s.zgRootHash, s.zgRootHash?.slice(0, 18) + "..."],
      ["HCS audit sequence recorded", s.hcsSeq > 0, `seq ${s.hcsSeq}`],
      ["device relay is ON after verifying the receipt", sim.relayOn()],
    ];
  });

  await scenario("2. Replay is rejected (payment and receipt)", async () => {
    const settledBefore = settleCount();
    const dup = await rent(1, lastHeader);
    const nack = await gw.hub.deliver(DEVICE.id, lastReceipt!, 2000);
    return [
      ["reusing the payment header is refused (409 PAYMENT_REPLAY)", dup.status === 409 && dup.body.error?.code === "PAYMENT_REPLAY"],
      ["device rejects the same receipt a second time (nack: replay)", nack.type === "nack" && nack.reason === "replay", JSON.stringify(nack)],
      ["nothing was settled again", settleCount() === settledBefore],
    ];
  });

  await scenario("3. Over the limit: human cancels World ID, nothing happens", async () => {
    const receiptsBefore = sim.received.length;
    const settledBefore = settleCount();
    const r = await rent(30, header()); // 3 HBAR is above the 2 HBAR step-up threshold
    const state = new URL(r.body.stepUpUrl ?? "http://x/").searchParams.get("state") ?? "";
    const cb = await http(`/stepup/callback?state=${state}&error=access_denied`);
    const s = await finish(r.body.sessionId);
    return [
      ["request is held for World ID step-up", r.status === 202 && r.body.state === "STEP_UP" && !!r.body.stepUpUrl],
      ["human cancels: result DENIED", cb.body.result === "DENIED"],
      ["session ends CANCELLED", s.state === "CANCELLED", timeline(s)],
      ["device never received a receipt", sim.received.length === receiptsBefore],
      ["nothing was settled", settleCount() === settledBefore],
    ];
  });

  await scenario("4. Over the limit: human approves World ID, device unlocks", async () => {
    const receiptsBefore = sim.received.length;
    const r = await rent(30, header());
    const state = new URL(r.body.stepUpUrl ?? "http://x/").searchParams.get("state") ?? "";
    const cb = await http(`/stepup/callback?state=${state}&code=approved`);
    const s = await finish(r.body.sessionId);
    return [
      ["request is held for World ID step-up", r.body.state === "STEP_UP"],
      ["human approves: result APPROVED", cb.body.result === "APPROVED"],
      ["session ends SETTLED", s.state === "SETTLED", timeline(s)],
      ["device received exactly one receipt and relay is ON", sim.received.length === receiptsBefore + 1 && sim.relayOn()],
    ];
  });

  await scenario("5. 0G is down: safe stop, device stays off", async () => {
    decider.mode = "throw";
    const receiptsBefore = sim.received.length;
    const settledBefore = settleCount();
    const r = await rent(1, header());
    const s = await finish(r.body.sessionId);
    return [
      ["session ends SAFE_STOP (never a default ALLOW)", s.state === "SAFE_STOP", timeline(s)],
      ["device never received a receipt", sim.received.length === receiptsBefore],
      ["nothing was settled", settleCount() === settledBefore],
      ["episode logged as SAFE_STOP", episodes.episodes.at(-1)?.outcome === "SAFE_STOP"],
    ];
  });

  await scenario("6. Device does not answer (unplugged): no ack, no settlement", async () => {
    sim.setMode("silent");
    const settledBefore = settleCount();
    const r = await rent(1, header());
    const s = await finish(r.body.sessionId);
    return [
      ["session ends CANCELLED", s.state === "CANCELLED", timeline(s)],
      ["reason is no ack", String(s.events.at(-1)?.detail).includes("no ack"), s.events.at(-1)?.detail],
      ["nothing was settled", settleCount() === settledBefore],
      ["device was told to switch off", sim.cancelled.includes(s.id)],
    ];
  });

  await scenario("7. Device is offline: request refused before any receipt", async () => {
    sim.close();
    for (let i = 0; i < 100 && gw.hub.isOnline(DEVICE.id); i++) await sleep(20);
    const settledBefore = settleCount();
    const r = await rent(1, header());
    await gw.orchestrator.idle();
    const checks: Check[] = [
      ["hub reports the device offline", !gw.hub.isOnline(DEVICE.id)],
      ["request refused with 409 DEVICE_OFFLINE", r.status === 409 && r.body.error?.code === "DEVICE_OFFLINE"],
      ["nothing was settled", settleCount() === settledBefore],
    ];
    await connectDevice(); // plug it back in for the next scenario
    return checks;
  });

  await scenario("8. Settlement fails after the device switched on: device is switched off", async () => {
    facilitator.settleOk = false;
    const r = await rent(1, header());
    const s = await finish(r.body.sessionId);
    return [
      ["session ends CANCELLED, unpaid", s.state === "CANCELLED" && String(s.events.at(-1)?.detail).includes("settle failed"), timeline(s)],
      ["settlement was attempted 3 times", facilitator.calls.slice(-3).every((c) => c === "settle")],
      ["device was told to switch off", sim.cancelled.includes(s.id)],
      ["relay is OFF (no free usage)", !sim.relayOn()],
    ];
  });

  // ---- teardown --------------------------------------------------------------------------------
  sim.close();
  gw.hub.close();
  for (const c of cleanups) c();
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });

  console.log(`\n${totalChecks - failedChecks}/${totalChecks} checks passed${failedChecks ? `, ${failedChecks} FAILED` : ""}`);
  process.exit(failedChecks ? 1 : 0);
}

const cleanups: Array<() => void> = [];
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
