/**
 * RulesDecider (L2, no IO): deterministic Decider with no AI and no credits.
 * Same contract as any Decider: returns a Decision, or throws (orchestrator maps a throw to SAFE_STOP).
 * Unknown/unsafe device state is a DENY with a reason, never a default ALLOW.
 */
import type { Decider, Decision, DecisionInput } from "@agentmeter/shared";

export interface RulesOptions {
  /** Device offline threshold (TRD: offline after 15s without heartbeat). */
  maxHeartbeatAgeSec?: number;
  /** Longest single rental. */
  maxMinutes?: number;
}

const BUSY_STATES = new Set(["ISSUED", "ACTIVE"]);

export class RulesDecider implements Decider {
  private n = 0;
  private readonly maxHeartbeatAgeSec: number;
  private readonly maxMinutes: number;

  constructor(opts: RulesOptions = {}) {
    this.maxHeartbeatAgeSec = opts.maxHeartbeatAgeSec ?? 15;
    this.maxMinutes = opts.maxMinutes ?? 60;
  }

  async decide(i: DecisionInput): Promise<Decision> {
    const requestId = `rules-${++this.n}`;
    const deny = (reason: string): Decision => ({ verdict: "DENY", reason, requestId });

    if (i.deviceStatus !== "ONLINE") return deny("device is not online");
    if (i.lastHeartbeatAgeSec === null || i.lastHeartbeatAgeSec > this.maxHeartbeatAgeSec) {
      return deny("device heartbeat is stale or missing");
    }
    if (i.relay) return deny("relay is already on");
    if (i.recentSessions.some((s) => BUSY_STATES.has(s.state))) return deny("device already has a live session");
    if (i.requestedMinutes > this.maxMinutes) return deny(`requested minutes exceed limit of ${this.maxMinutes}`);

    return { verdict: "ALLOW", reason: "all rules passed", requestId };
  }
}
