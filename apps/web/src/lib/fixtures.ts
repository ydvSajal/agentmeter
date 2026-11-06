import type {
  AgentView,
  AuditRow,
  DeviceView,
  SessionView,
} from "@agentmeter/shared/src/schemas";
export function fixtures(now = Math.floor(Date.now() / 1000)) {
  const devices: DeviceView[] = [
    {
      id: "esp32-01",
      name: "Workshop fan",
      status: "ONLINE",
      relay: true,
      lastHeartbeat: now - 2,
      pricePerMinute: "1000000",
      asset: "HBAR",
    },
    {
      id: "esp32-02",
      name: "Desk light",
      status: "ONLINE",
      relay: false,
      lastHeartbeat: now - 4,
      pricePerMinute: "500000",
      asset: "HBAR",
    },
    {
      id: "esp32-03",
      name: "Water pump",
      status: "ONLINE",
      relay: false,
      lastHeartbeat: now - 1,
      pricePerMinute: "2000000",
      asset: "HBAR",
    },
    {
      id: "esp32-04",
      name: "Ventilation unit",
      status: "OFFLINE",
      relay: false,
      lastHeartbeat: now - 360,
      pricePerMinute: "1500000",
      asset: "HBAR",
    },
  ];
  const agents: AgentView[] = [
    {
      id: "a_workshop",
      name: "Workshop assistant",
      hederaAccountId: "0.0.1001",
      dailyCap: "100000000",
      spentToday: "42000000",
      asset: "HBAR",
    },
    {
      id: "a_climate",
      name: "Climate operator",
      hederaAccountId: "0.0.1002",
      dailyCap: "200000000",
      spentToday: "35000000",
      asset: "HBAR",
    },
    {
      id: "a_facilities",
      name: "Facilities agent",
      hederaAccountId: "0.0.1003",
      dailyCap: "100000000",
      spentToday: "85000000",
      asset: "HBAR",
    },
  ];
  const session: SessionView = {
    id: "s_workshop",
    deviceId: "esp32-01",
    agentId: "a_workshop",
    state: "ACTIVE",
    amount: "10000000",
    asset: "HBAR",
    minutes: 10,
    expiresAt: now + 467,
    hederaTxId: null,
    zgRequestId: "fixture_decision_01",
    zgRootHash: null,
    hcsSeq: null,
    events: ["PENDING", "DECIDING", "ISSUED", "ACTIVE"].map((state, i) => ({
      state: state as SessionView["state"],
      at: now - 133 + i,
      detail:
        [
          "Payment verified",
          "0G decision: ALLOW",
          "Signed receipt delivered",
          "Device acknowledged; relay on",
        ][i] ?? null,
    })),
  };
  const audit: AuditRow[] = ["ACTIVE", "SETTLED", "SAFE_STOP", "CANCELLED"].map(
    (state, i) => ({
      sessionId: i === 0 ? session.id : `s_sample_${i}`,
      state: state as AuditRow["state"],
      at: now - i * 190,
      hederaTxId: null,
      hashscanUrl: null,
      hcsSeq: null,
      zgRequestId: i < 2 ? `fixture_decision_0${i + 1}` : null,
      zgRootHash: null,
    }),
  );
  const sessions: SessionView[] = [
    session,
    ...audit.slice(1).map((row) => ({
      ...session,
      id: row.sessionId,
      state: row.state,
      expiresAt: null,
      zgRequestId: row.zgRequestId,
      events: [
        {
          state: row.state,
          at: row.at,
          detail:
            row.state === "SAFE_STOP"
              ? "Decision service unavailable. No access granted."
              : row.state === "CANCELLED"
                ? "No device acknowledgment. Payment not settled."
                : "Sample session completed.",
        },
      ],
    })),
    {
      ...session,
      id: "s_stepup",
      deviceId: "esp32-03",
      agentId: "a_climate",
      state: "STEP_UP",
      minutes: 20,
      amount: "40000000",
      expiresAt: null,
      zgRequestId: null,
      events: [
        { state: "PENDING", at: now - 20, detail: "Agent requested access." },
        {
          state: "STEP_UP",
          at: now - 19,
          detail: "Human approval required before a decision.",
        },
      ],
    },
    { ...session, id: "s_expired", expiresAt: now - 1 },
  ];
  audit.push({
    sessionId: "s_stepup",
    state: "STEP_UP",
    at: now - 19,
    hederaTxId: null,
    hashscanUrl: null,
    hcsSeq: null,
    zgRequestId: null,
    zgRootHash: null,
  });
  audit.sort((a, b) => b.at - a.at);
  return { devices, agents, audit, session, sessions };
}
