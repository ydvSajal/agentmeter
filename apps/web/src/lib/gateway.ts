// Browser-safe subpaths: the shared barrel also exports Node receipt signing and fakes.
import {
  createGatewayClient,
  type GatewayClient,
} from "@agentmeter/shared/src/api-client";
import type {
  AgentView,
  AuditRow,
  DeviceView,
  SessionView,
} from "@agentmeter/shared/src/schemas";
import { demoData, demoSession } from "./demo-store";
export { money } from "./format";
import { fixtureMode, gatewayUrl } from "./config";
export { fixtureMode, gatewayUrl } from "./config";
export const gateway = createGatewayClient(gatewayUrl, (input, init) =>
  fetch(input, {
    ...init,
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }),
);
export type DashboardData = {
  devices: DeviceView[];
  agents: AgentView[];
  audit: AuditRow[];
  session: SessionView | null;
  issues: string[];
  sessionStale: boolean;
};
/** Independent reads retain last-good blocks when another endpoint fails. */
export async function readDashboard(
  client: GatewayClient,
  previous?: DashboardData,
): Promise<DashboardData> {
  const [devices, agents, audit] = await Promise.allSettled([
    client.devices(),
    client.agents(),
    client.audit(),
  ]);
  const issues: string[] = [];
  function retain<T>(
    result: PromiseSettledResult<T>,
    label: string,
    prior: T,
  ): T {
    if (result.status === "fulfilled") return result.value;
    issues.push(`${label} unavailable`);
    return prior;
  }
  const data: DashboardData = {
    devices: retain(devices, "Devices", previous?.devices ?? []),
    agents: retain(agents, "Agents", previous?.agents ?? []),
    audit: retain(audit, "Audit", previous?.audit ?? []),
    session: null,
    issues,
    sessionStale: false,
  };
  const current = data.audit.find((row) =>
    ["ACTIVE", "STEP_UP", "DECIDING", "ISSUED"].includes(row.state),
  );
  if (current) {
    try {
      data.session = await client.session(current.sessionId);
    } catch {
      issues.push("Session unavailable");
      data.sessionStale = true;
    }
  }
  if (audit.status === "rejected") data.sessionStale = true;
  return data;
}
export async function loadDashboard(
  previous?: DashboardData,
): Promise<DashboardData> {
  if (fixtureMode) {
    const { devices, agents, audit, session } = demoData();
    return { devices, agents, audit, session, issues: [], sessionStale: false };
  }
  return readDashboard(gateway, previous);
}
export async function loadSession(id: string): Promise<SessionView> {
  return fixtureMode ? demoSession(id) : gateway.session(id);
}
export async function startApproval(id: string, fetcher: typeof fetch = fetch) {
  if (fixtureMode) throw new Error("Demo mode cannot request real approval.");
  const response = await fetcher(
    `${gatewayUrl}/stepup/${encodeURIComponent(id)}/start`,
    { method: "POST", credentials: "include", signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok)
    throw new Error(
      "Could not start human approval. Refresh the session and retry.",
    );
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !("authorizeUrl" in body) ||
    typeof body.authorizeUrl !== "string"
  )
    throw new Error("Invalid approval response.");
  const url = new URL(body.authorizeUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Approval requires a secure authorization URL.");
  return url.href;
}
