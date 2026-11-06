import { describe, expect, it } from "vitest";
import { Decision, type DecisionInput } from "@agentmeter/shared";
import { loadConfig } from "../src/config";
import { RulesDecider } from "../src/core/rules-decider";
import { buildPorts } from "../src/ports";

const base = (over: Partial<DecisionInput> = {}): DecisionInput =>
  ({
    deviceId: "dev_1",
    deviceStatus: "ONLINE",
    relay: false,
    lastHeartbeatAgeSec: 2,
    recentSessions: [],
    requestedMinutes: 5,
    amount: { amount: "1", asset: "HBAR" },
    agentId: "agent_1",
    ...over,
  }) as DecisionInput;

describe("RulesDecider", () => {
  const d = new RulesDecider();

  it("allows a healthy idle device and output parses as a Decision", async () => {
    const r = await d.decide(base());
    expect(r.verdict).toBe("ALLOW");
    expect(Decision.safeParse(r).success).toBe(true);
  });

  it.each([
    ["offline", { deviceStatus: "OFFLINE" as const }],
    ["no heartbeat", { lastHeartbeatAgeSec: null }],
    ["stale heartbeat", { lastHeartbeatAgeSec: 16 }],
    ["relay already on", { relay: true }],
    ["live session", { recentSessions: [{ state: "ACTIVE" as const, at: 1 }] }],
    ["too many minutes", { requestedMinutes: 61 }],
  ])("denies: %s", async (_n, over) => {
    const r = await d.decide(base(over));
    expect(r.verdict).toBe("DENY");
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it("is wired by DECIDER=rules", async () => {
    const p = buildPorts(loadConfig({ DECIDER: "rules" }));
    expect((await p.decider.decide(base())).verdict).toBe("ALLOW");
  });
});
