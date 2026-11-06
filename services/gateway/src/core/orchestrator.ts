/**
 * The ONLY place the order of operations lives (docs/ARCHITECTURE.md §7):
 * verify -> policy -> (step-up) -> 0G decide -> sign receipt -> push to device -> ack -> settle -> log.
 *
 * Hard rules (TRD §3.2):
 *  - Any 0G error, timeout, DENY, or malformed output => SAFE_STOP. Never a default ALLOW.
 *  - Payment settles only after a valid device ack.
 *  - Logging (HCS, 0G Storage) runs in the background and never changes a decision.
 *  - The async flow never rejects: anything unexpected moves the session to a safe terminal state
 *    and switches the device off (`failSafe`).
 */
import { randomUUID } from "node:crypto";
import {
  AgentMeterError,
  Decision,
  generateNonce,
  signReceipt,
  withTimeout,
  type DecisionInput,
  type NotificationKind,
  type PaymentRequirements,
  type SessionState,
} from "@agentmeter/shared";
import type { Repos, SessionPatch } from "@agentmeter/db";
import type { Logger } from "pino";
import type { Ports } from "../ports";
import type { DeviceChannel } from "./device-channel";
import { evaluatePolicy } from "./policy";
import { isTerminal, transition } from "./session-machine";

export interface OrchestratorOptions {
  receiptSeedBase64: string;
  stepUpThreshold: bigint; // base units
  ackTimeoutMs: number;
  zgTimeoutMs: number;
  verifyTimeoutMs?: number;
  settleTimeoutMs?: number;
  rateWindowSec?: number;
  maxSessionsPerWindow?: number;
  /** Wait between settle attempts (3 attempts total). Tests use 0. */
  settleBackoffMs?: number;
  /** A session still waiting for a human after this long is cancelled by `expireStaleStepUps`. */
  stepUpTtlSec?: number;
  /** Recipient for email alerts (AD035). Absent: no notifications. */
  notifyTo?: string;
  /** Wait before the single retry of a failed email send. Tests use 0. */
  notifyRetryMs?: number;
  hederaNetwork?: string;
  /** Daily cap (base units) for wallet agents created on first payment (AD044). */
  walletDailyCap?: bigint;
}

const SETTLE_ATTEMPTS = 3;
const NOTIFY_MAX_PER_HOUR = 20; // protects the free Resend quota and stops mail loops
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface SessionEventMsg {
  sessionId: string;
  state: SessionState;
  at: number;
  detail: string | null;
}

export interface StartResult {
  sessionId: string;
  state: SessionState;
  stepUpUrl?: string;
  /** Resolves when the async part (decide -> settle) finishes. HTTP ignores it; tests await it. */
  done: Promise<void>;
}

interface PendingPayment {
  paymentHeader: string;
  requirements: PaymentRequirements;
}

export class Orchestrator {
  // ponytail: in-memory pending payments; a restart loses them, so `recoverOrphans` cancels every unsettled session at boot.
  private pending = new Map<string, PendingPayment>();
  /** World authorize URL per session waiting on a human. In memory like `pending`: boot recovery cancels STEP_UP sessions anyway. */
  private stepUpAuth = new Map<string, string>();
  private background = new Set<Promise<unknown>>();
  private listeners = new Set<(e: SessionEventMsg) => void>();
  private notifySentAt: number[] = [];
  private readonly o: Required<Omit<OrchestratorOptions, "notifyTo">> & { notifyTo?: string };

  constructor(
    private readonly repos: Repos,
    private readonly ports: Ports,
    private readonly devices: DeviceChannel,
    private readonly log: Logger,
    opts: OrchestratorOptions,
  ) {
    this.o = {
      verifyTimeoutMs: 5000,
      settleTimeoutMs: 10_000,
      rateWindowSec: 3600,
      maxSessionsPerWindow: 120, // pay-per-minute renewals: ~60/hour per device
      walletDailyCap: 1_000_000_000n, // 10 HBAR
      settleBackoffMs: 500,
      stepUpTtlSec: 300,
      notifyRetryMs: 500,
      hederaNetwork: "testnet",
      ...opts,
    };
  }

  onEvent(fn: (e: SessionEventMsg) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Await all background logging (tests, graceful shutdown). */
  async idle(): Promise<void> {
    while (this.background.size) await Promise.allSettled([...this.background]);
  }

  /** Price and x402 requirements for a 402 response. */
  async quote(deviceId: string, minutes: number) {
    const device = await this.repos.devices.get(deviceId);
    if (!device) throw new AgentMeterError("NOT_FOUND", `unknown device ${deviceId}`);
    const amount = (BigInt(device.pricePerMinute) * BigInt(minutes)).toString();
    const requirements = await this.ports.facilitator.requirements({ deviceId, minutes, amount, payTo: device.payTo });
    return { device, amount, requirements };
  }

  async startSession(input: { deviceId: string; agentId: string; minutes: number; paymentHeader: string }): Promise<StartResult> {
    const now = this.ports.clock.now();
    let agent = await this.repos.agents.get(input.agentId);
    // Wallet payers (AD044) name themselves `wallet:<0.0.x>`; the agent row is created only after the
    // facilitator proves that account signed the payment.
    const walletAccount = /^wallet:(0\.0\.\d+)$/.exec(input.agentId)?.[1];
    if (!agent && !walletAccount) throw new AgentMeterError("POLICY_DENIED", `unknown agent ${input.agentId}`);
    const { device, amount, requirements } = await this.quote(input.deviceId, input.minutes);

    const verified = await withTimeout(
      () => this.ports.facilitator.verify(input.paymentHeader, requirements),
      this.o.verifyTimeoutMs,
      "facilitator verify",
    );
    if (!verified.valid) throw new AgentMeterError("PAYMENT_UNVERIFIED", verified.invalidReason ?? "payment not valid");
    if (!agent) {
      if (verified.payer !== walletAccount) throw new AgentMeterError("POLICY_DENIED", "payer account does not match the wallet");
      agent = await this.repos.agents.ensureWallet(walletAccount!, this.o.walletDailyCap.toString());
    }
    if (verified.payer && verified.payer !== agent.hederaAccountId) {
      throw new AgentMeterError("POLICY_DENIED", "payer account does not belong to this agent");
    }

    // Count before creating so this request is not rate-limited by itself.
    const recent = await this.repos.sessions.countForDeviceSince(device.id, now - this.o.rateWindowSec);
    const sessionId = `s_${randomUUID()}`;
    await this.repos.sessions.create({
      id: sessionId,
      deviceId: device.id,
      agentId: agent.id,
      amount,
      asset: device.asset,
      minutes: input.minutes,
      paymentPayloadHash: verified.payloadHash,
      payer: verified.payer ?? agent.hederaAccountId,
      now,
    }); // throws PAYMENT_REPLAY on a reused payload
    this.emit({ sessionId, state: "PENDING", at: now, detail: null });

    // From here on the session exists: an unexpected error must not leave it PENDING (it would hold cap).
    let policy: ReturnType<typeof evaluatePolicy>;
    try {
      // In-flight sessions of this agent count as spent, so concurrent requests cannot overshoot the cap.
      const reserved = await this.repos.sessions.reservedAmount(agent.id, sessionId, now - (now % 86_400));
      policy = evaluatePolicy({
        amount: BigInt(amount),
        stepUpThreshold: this.o.stepUpThreshold,
        agent: {
          dailyCap: BigInt(agent.dailyCap),
          spentToday: this.repos.agents.spentOn(agent, now) + reserved,
          allowedDeviceIds: this.repos.agents.allowedDeviceIds(agent),
        },
        device: {
          id: device.id,
          online: this.devices.isOnline(device.id),
          recentSessionCount: recent,
          maxSessionsPerWindow: this.o.maxSessionsPerWindow,
        },
      });

      if (policy.verdict === "DENY") {
        await this.move(sessionId, "PENDING", "CANCELLED", {}, policy.reason);
      } else if (policy.verdict === "STEP_UP") {
        this.pending.set(sessionId, { paymentHeader: input.paymentHeader, requirements });
        await this.move(sessionId, "PENDING", "STEP_UP", {}, policy.reason);
        const { authorizeUrl } = await this.ports.stepUp.start({
          sessionId,
          action: { deviceId: device.id, minutes: input.minutes, amount, asset: device.asset, expiresAt: now + this.o.stepUpTtlSec },
        });
        this.notify("STEP_UP_REQUESTED", sessionId, "AgentMeter: human approval needed", (s) => [
          `Agent ${s.agentId} wants ${s.minutes} min on device ${s.deviceId} (${s.amount} ${s.asset} base units).`,
          `Approve with World ID (expires in ${Math.round(this.o.stepUpTtlSec / 60)} min): ${authorizeUrl}`,
          "The link only starts the World ID check; it cannot approve by itself.",
        ]);
        this.stepUpAuth.set(sessionId, authorizeUrl);
        return { sessionId, state: "STEP_UP", stepUpUrl: authorizeUrl, done: Promise.resolve() };
      } else {
        this.pending.set(sessionId, { paymentHeader: input.paymentHeader, requirements });
        await this.move(sessionId, "PENDING", "DECIDING");
      }
    } catch (e) {
      await this.failSafe(sessionId, e);
      throw e;
    }
    if (policy.verdict === "DENY") throw new AgentMeterError(policy.code, policy.reason, sessionId);
    return { sessionId, state: "DECIDING", done: this.decideAndIssue(sessionId) };
  }

  /**
   * World callback. Approve resumes the flow; deny/expire cancels and nothing is ever settled.
   * A callback for a session that already left STEP_UP (expired, cancelled, restarted) throws STEP_UP_EXPIRED.
   */
  async completeStepUp(cb: { code?: string; state: string; error?: string }) {
    const r = await this.ports.stepUp.complete(cb); // throws on unknown/reused state
    this.stepUpAuth.delete(r.sessionId);
    const expired = () => new AgentMeterError("STEP_UP_EXPIRED", "step-up is no longer pending (expired or cancelled)", r.sessionId);
    const approved = r.result === "APPROVED";
    if (approved && !this.pending.has(r.sessionId)) throw expired();
    if (!approved) this.pending.delete(r.sessionId);
    try {
      await this.move(r.sessionId, "STEP_UP", approved ? "DECIDING" : "CANCELLED", {},
        approved ? "world id approved" : `step-up ${r.result.toLowerCase()}`);
    } catch (e) {
      const s = await this.repos.sessions.get(r.sessionId).catch(() => null);
      if (s && s.state !== "STEP_UP") throw expired(); // lost the race to expiry/cancel
      throw e;
    }
    return { ...r, done: approved ? this.decideAndIssue(r.sessionId) : Promise.resolve() };
  }

  /** Authorize URL for POST /stepup/:id/start. Only while the session is still waiting on a human. */
  async stepUpAuthorizeUrl(sessionId: string): Promise<string> {
    const s = await this.repos.sessions.get(sessionId);
    if (!s) throw new AgentMeterError("NOT_FOUND", "session not found");
    const url = this.stepUpAuth.get(sessionId);
    if (s.state !== "STEP_UP" || !url) {
      throw new AgentMeterError("STEP_UP_EXPIRED", "no step-up is pending for this session (expired, decided or restarted)", sessionId);
    }
    return url;
  }

  /** Cancel sessions that waited for a human longer than `stepUpTtlSec`. Never throws (runs on a timer). */
  async expireStaleStepUps(): Promise<void> {
    try {
      const stale = await this.repos.sessions.listByStateOlderThan("STEP_UP", this.ports.clock.now() - this.o.stepUpTtlSec);
      for (const s of stale) {
        try {
          await this.move(s.id, "STEP_UP", "CANCELLED", {}, "step-up expired");
          this.pending.delete(s.id);
          this.stepUpAuth.delete(s.id);
        } catch (e) {
          this.log.warn({ sessionId: s.id, err: errMsg(e) }, "step-up expiry skipped (session moved meanwhile)");
        }
      }
    } catch (e) {
      this.log.error({ err: errMsg(e) }, "step-up expiry sweep failed");
    }
  }

  /**
   * Boot-time recovery: pending payments live in memory, so after a restart no unsettled session can
   * ever settle. Move every non-terminal session to a terminal state. Payment is never settled here.
   */
  async recoverOrphans(): Promise<void> {
    const plan: Array<[SessionState, SessionState, string]> = [
      ["PENDING", "CANCELLED", "gateway restarted"],
      ["STEP_UP", "CANCELLED", "gateway restarted"],
      ["DECIDING", "SAFE_STOP", "gateway restarted"],
      ["ISSUED", "CANCELLED", "gateway restarted"],
      ["ACTIVE", "CANCELLED", "gateway restarted before settlement"],
    ];
    const everything = this.ports.clock.now() + 1; // "older than now+1" lists every session in the state
    for (const [from, to, detail] of plan) {
      for (const s of await this.repos.sessions.listByStateOlderThan(from, everything)) {
        try {
          if (from === "ISSUED" || from === "ACTIVE") this.devices.cancel(s.deviceId, s.id); // best effort; usually not connected yet
          await this.move(s.id, from, to, {}, detail);
          this.log.warn({ sessionId: s.id, from, to }, "recovered orphaned session");
        } catch (e) {
          this.log.error({ sessionId: s.id, err: errMsg(e) }, "orphan recovery failed for session");
        }
      }
    }
  }

  /** The async flow (decide -> settle). Never rejects: unexpected errors fail safe. */
  private decideAndIssue(sessionId: string): Promise<void> {
    return this.runFlow(sessionId).catch((e: unknown) => this.failSafe(sessionId, e));
  }

  /**
   * Catch-all: move the session to a safe terminal state based on its CURRENT persisted state and
   * switch the device off. Never throws.
   */
  private async failSafe(sessionId: string, err: unknown): Promise<void> {
    this.log.error({ sessionId, err: errMsg(err) }, "session flow failed unexpectedly; failing safe");
    this.pending.delete(sessionId);
    try {
      const s = await this.repos.sessions.get(sessionId);
      const state = s?.state as SessionState | undefined;
      const detail = `fail-safe: ${errMsg(err)}`;
      if (!s || !state || isTerminal(state)) return;
      if (state === "ISSUED" || state === "ACTIVE") {
        try {
          this.devices.cancel(s.deviceId, sessionId);
        } catch (e) {
          this.log.error({ sessionId, err: errMsg(e) }, "fail-safe: device cancel failed");
        }
      }
      await this.move(sessionId, state, state === "DECIDING" ? "SAFE_STOP" : "CANCELLED", {}, detail);
    } catch (e) {
      this.log.error({ sessionId, err: errMsg(e) }, "fail-safe could not move the session (restart recovery will)");
    }
  }

  private async runFlow(sessionId: string): Promise<void> {
    const s = await this.repos.sessions.get(sessionId);
    if (!s) throw new AgentMeterError("INTERNAL", "session vanished", sessionId);
    const device = await this.repos.devices.get(s.deviceId);
    const now = this.ports.clock.now();
    const recent = await this.repos.sessions.recentForDevice(s.deviceId);
    const input: DecisionInput = {
      deviceId: s.deviceId,
      deviceStatus: this.devices.isOnline(s.deviceId) ? "ONLINE" : "OFFLINE",
      relay: device?.relay ?? false,
      lastHeartbeatAgeSec: device?.lastHeartbeat != null ? now - device.lastHeartbeat : null,
      recentSessions: recent.map((r) => ({ state: r.state as SessionState, at: r.createdAt })),
      requestedMinutes: s.minutes,
      amount: s.amount,
      agentId: s.agentId,
    };

    // 1. 0G decision. Anything but a well-formed ALLOW is SAFE_STOP.
    let decision: Decision | null = null;
    let failure: string | null = null;
    try {
      const raw = await withTimeout(() => this.ports.decider.decide(input), this.o.zgTimeoutMs, "0G decide");
      const parsed = Decision.safeParse(raw);
      if (!parsed.success) failure = "malformed decision";
      else decision = parsed.data;
    } catch (e) {
      failure = e instanceof Error ? e.message : "decider error";
    }
    const outcome = decision?.verdict === "ALLOW" ? "ALLOW" : decision ? "DENY" : "SAFE_STOP";
    this.recordEpisode(sessionId, s.deviceId, s.agentId, input, decision, outcome, now);

    if (!decision || decision.verdict !== "ALLOW") {
      this.pending.delete(sessionId);
      await this.move(sessionId, "DECIDING", "SAFE_STOP", decision ? { zgRequestId: decision.requestId } : {},
        decision ? `0G deny: ${decision.reason}` : `safe stop: ${failure}`);
      return;
    }

    // 2. Sign the receipt and push it to the device.
    const nonce = generateNonce();
    if (!(await this.repos.nonces.use(nonce, now))) throw new AgentMeterError("INTERNAL", "nonce collision", sessionId);
    // Pay-per-minute renewal (AD045): while the relay is on under a paid lease, new time starts where
    // that lease ends, so back-to-back 1-minute payments add up instead of overlapping.
    const relayOn = (await this.repos.devices.get(s.deviceId))?.relay ?? false;
    const leaseEnd = relayOn ? await this.repos.sessions.leaseEnd(s.deviceId, now) : null;
    const receipt = {
      deviceId: s.deviceId,
      sessionId,
      nonce,
      notBefore: now,
      expiresAt: Math.max(now, leaseEnd ?? 0) + s.minutes * 60,
      amount: s.amount,
      payer: s.payer ?? "0.0.0",
    };
    const { sig } = signReceipt(receipt, this.o.receiptSeedBase64);
    await this.move(sessionId, "DECIDING", "ISSUED", {
      zgRequestId: decision.requestId,
      nonce,
      notBefore: receipt.notBefore,
      expiresAt: receipt.expiresAt,
    });

    const delivery = await this.devices.deliver(s.deviceId, { receipt, sig }, this.o.ackTimeoutMs);
    if (delivery.type !== "ack") {
      this.pending.delete(sessionId);
      this.devices.cancel(s.deviceId, sessionId);
      const detail = delivery.type === "nack" ? `device rejected: ${delivery.reason}` : `no ack: ${delivery.type}`;
      await this.move(sessionId, "ISSUED", "CANCELLED", {}, detail); // payment is never settled
      return;
    }
    await this.move(sessionId, "ISSUED", "ACTIVE", {}, "device ack");

    // 3. Settle only now (idempotent, so retrying is safe). The device is already on: if settle keeps
    //    failing, switch it off and cancel unpaid rather than give free usage.
    const pay = this.pending.get(sessionId);
    if (!pay) throw new AgentMeterError("INTERNAL", "pending payment missing", sessionId);
    let txId: string | undefined;
    for (let attempt = 1; attempt <= SETTLE_ATTEMPTS && !txId; attempt++) {
      if (attempt > 1 && this.o.settleBackoffMs > 0) await new Promise((r) => setTimeout(r, this.o.settleBackoffMs));
      try {
        const res = await withTimeout(
          () => this.ports.facilitator.settle(pay.paymentHeader, pay.requirements),
          this.o.settleTimeoutMs,
          "facilitator settle",
        );
        if (res.success && res.txId) txId = res.txId;
        else this.log.warn({ sessionId, attempt, error: res.error }, "settle failed");
      } catch (e) {
        this.log.warn({ sessionId, attempt, err: errMsg(e) }, "settle error");
      }
    }
    this.pending.delete(sessionId);
    if (txId) {
      // Money has moved. Bookkeeping errors below must NEVER be treated as a failed settle: that would
      // retry the payment and switch off a device that was paid for.
      this.log.info({ sessionId, txId }, "settled"); // logged first: the tx id survives a failed DB write
      try {
        await this.move(sessionId, "ACTIVE", "SETTLED", { hederaTxId: txId }, "settled");
        await this.repos.agents.addSpend(s.agentId, BigInt(s.amount), this.ports.clock.now());
      } catch (e) {
        this.log.error({ sessionId, txId, err: errMsg(e) }, "settled on-chain but bookkeeping failed; reconcile manually");
      }
      return;
    }
    this.devices.cancel(s.deviceId, sessionId);
    await this.move(sessionId, "ACTIVE", "CANCELLED", {}, "settle failed: device switched off, unpaid");
    this.log.error({ sessionId }, `settle failed after ${SETTLE_ATTEMPTS} attempts; device switched off, session cancelled unpaid`);
  }

  /** Legal transition + DB compare-and-set + live event + background HCS audit. */
  private async move(sessionId: string, from: SessionState, to: SessionState, patch: SessionPatch = {}, detail?: string) {
    transition(from, to, sessionId);
    const at = this.ports.clock.now();
    const eventId = await this.repos.sessions.move(sessionId, from, to, at, patch, detail);
    this.emit({ sessionId, state: to, at, detail: detail ?? null });
    this.notifyOnState(sessionId, to, patch, detail);
    this.bg(async () => {
      const { seq } = await this.ports.audit.append({
        v: 1,
        sessionId,
        state: to,
        at,
        ...(patch.hederaTxId ? { hederaTxId: patch.hederaTxId } : {}),
        ...(patch.zgRequestId ? { zgRequestId: patch.zgRequestId } : {}),
      });
      await this.repos.sessions.setEventHcsSeq(eventId, seq);
      await this.repos.sessions.patch(sessionId, { hcsSeq: seq }, at);
    }, "hcs audit");
  }

  /** Called by the hub when a device drops. Alerts only if a paid session is live on it. */
  async onDeviceOffline(deviceId: string): Promise<void> {
    try {
      const live = await this.repos.sessions.listByStateOlderThan("ACTIVE", this.ports.clock.now() + 1);
      for (const s of live.filter((x) => x.deviceId === deviceId)) {
        this.notify("DEVICE_OFFLINE", s.id, `AgentMeter: device ${deviceId} went offline`, () => [
          `Device ${deviceId} stopped sending heartbeats during session ${s.id}.`,
          "The device enforces its own timer and switches off at expiry.",
        ]);
      }
    } catch (e) {
      this.log.warn({ deviceId, err: errMsg(e) }, "device-offline notification skipped");
    }
  }

  private notifyOnState(sessionId: string, to: SessionState, patch: SessionPatch, detail?: string) {
    if (to === "SETTLED") {
      const tx = patch.hederaTxId;
      this.notify("SESSION_SETTLED", sessionId, "AgentMeter: session settled", (s) => [
        `Device ${s.deviceId}, ${s.minutes} min, ${s.amount} ${s.asset} base units.`,
        ...(tx ? [`Hedera tx ${tx}: https://hashscan.io/${this.o.hederaNetwork}/transaction/${tx}`] : []),
      ]);
    } else if (to === "CANCELLED") {
      this.notify("SESSION_CANCELLED", sessionId, "AgentMeter: session cancelled", (s) => [
        `Device ${s.deviceId}: ${detail ?? "cancelled"}.`,
        "Nothing was settled for this session.",
      ]);
    } else if (to === "SAFE_STOP") {
      this.notify("SAFE_STOP", sessionId, "AgentMeter: SAFE_STOP, device left OFF", (s) => [
        `Device ${s.deviceId}: ${detail ?? "safe stop"}.`,
        "The device was not switched on and nothing was settled.",
      ]);
    }
  }

  /**
   * Email alert (AD035). Fire-and-forget after state is persisted: a send failure only marks the
   * Notification row FAILED, it never changes a session or blocks ack/settle. One retry, hourly cap.
   */
  private notify(
    kind: NotificationKind,
    sessionId: string,
    subject: string,
    lines: (s: { deviceId: string; agentId: string; minutes: number; amount: string; asset: string }) => string[],
  ) {
    const to = this.o.notifyTo;
    const notifier = this.ports.notifier;
    if (!to || !notifier) return;
    this.bg(async () => {
      const now = this.ports.clock.now();
      const id = `n_${randomUUID()}`;
      await this.repos.notifications.create({ id, kind, toEmail: to, sessionId, now });
      const s = await this.repos.sessions.get(sessionId);
      this.notifySentAt = this.notifySentAt.filter((t) => t > now - 3600);
      if (!s) return void (await this.repos.notifications.mark(id, "FAILED", { error: "session not found" }));
      if (this.notifySentAt.length >= NOTIFY_MAX_PER_HOUR) {
        return void (await this.repos.notifications.mark(id, "FAILED", { error: "rate capped (20/hour)" }));
      }
      this.notifySentAt.push(now);
      const msg = { kind, sessionId, idempotencyKey: `${kind}:${sessionId}`, subject, text: lines(s).join("\n") };
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const r = await notifier.send(msg);
          return void (await this.repos.notifications.mark(id, "SENT", { providerId: r.id }));
        } catch (e) {
          lastErr = e;
          if (attempt === 1 && this.o.notifyRetryMs > 0) await new Promise((r) => setTimeout(r, this.o.notifyRetryMs));
        }
      }
      await this.repos.notifications.mark(id, "FAILED", { error: errMsg(lastErr).slice(0, 300) });
    }, "notification");
  }

  private recordEpisode(
    sessionId: string,
    deviceId: string,
    agentId: string,
    input: DecisionInput,
    decision: Decision | null,
    outcome: "ALLOW" | "DENY" | "SAFE_STOP",
    at: number,
  ) {
    this.bg(async () => {
      const { rootHash } = await this.ports.episodes.put({ v: 1, sessionId, deviceId, agentId, input, decision, outcome, at });
      await this.repos.sessions.patch(sessionId, { zgRootHash: rootHash }, this.ports.clock.now());
    }, "0G episode");
  }

  private bg(fn: () => Promise<unknown>, label: string) {
    const p = fn().catch((e: unknown) => this.log.warn({ err: (e as Error).message }, `${label} failed (decision unaffected)`));
    this.background.add(p);
    void p.finally(() => this.background.delete(p));
  }

  private emit(e: SessionEventMsg) {
    for (const fn of this.listeners) {
      try {
        fn(e);
      } catch {
        /* a broken listener must not break the flow */
      }
    }
  }
}
