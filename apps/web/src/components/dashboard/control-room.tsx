"use client";
import {
  ArrowDownLeft,
  ChevronRight,
  Fingerprint,
  Radio,
  RefreshCw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { AppShell, titles, type View } from "../app-shell";
import { Button } from "../ui/button";
import { fixtureMode, loadDashboard } from "@/lib/gateway";
import { money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { useSSE } from "@/lib/use-sse";
import { useClock } from "@/lib/use-clock";
import { DeviceFleet } from "./device-fleet";
import { AgentBudgets } from "./agent-budgets";
import { AuditTable } from "./audit-table";
import { SessionPanel } from "./session-panel";
import { DemoScenarios } from "../demo-scenarios";
export function Dashboard({ view }: { view: View }) {
  const { data, error, loading, updated, refresh } = useResource(loadDashboard);
  const now = useClock(),
    connected = useSSE(refresh);
  const devices = data?.devices ?? [],
    agents = data?.agents ?? [],
    audit = data?.audit ?? [];
  const issues = [error, ...(data?.issues ?? [])].filter(Boolean);
  return (
    <AppShell view={view}>
      <div className="page-heading">
        <div>
          <div className="context">Workspace / Control room</div>
          <h1>
            {titles[view]}
            <span className="count">
              {view === "devices"
                ? devices.length
                : view === "agents"
                  ? agents.length
                  : audit.length}
            </span>
          </h1>
          <p>
            {view === "devices"
              ? "Physical access. Agent payments. Human guardrails."
              : view === "agents"
                ? "Autonomous spending, within the limits you set."
                : "Every decision leaves a trace."}
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spinning" : ""} />
          {loading ? "Refreshing" : "Refresh"}
        </Button>
      </div>
      <div className="mode-notice">
        <Radio size={14} />
        <span>
          {fixtureMode
            ? "Demo workspace"
            : connected
              ? "Gateway connected"
              : "Event stream reconnecting"}
        </span>
        <span className="muted">
          {fixtureMode
            ? "Sample devices and receipts · no real payments"
            : "Live gateway data · fallback refresh every 15s"}
        </span>
        <span className="freshness">
          {updated
            ? `Checked ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Connecting…"}
        </span>
      </div>
      {issues.length > 0 && (
        <div role="alert" className="error">
          {issues.join(". ")}. Previously loaded blocks may be stale.{" "}
          <button onClick={refresh}>Retry</button>
        </div>
      )}
      {fixtureMode && <DemoScenarios />}
      <div className="summary" aria-busy={loading}>
        <div>
          <span>Devices online</span>
          <strong>
            {data ? devices.filter((d) => d.status === "ONLINE").length : "—"}
            <small> / {devices.length}</small>
          </strong>
          <span>Last reported heartbeat status</span>
        </div>
        <div>
          <span>Relays powered</span>
          <strong>
            {data ? devices.filter((d) => d.relay).length : "—"}
            <small> active</small>
          </strong>
          <span>Last reported relay state</span>
        </div>
        <div>
          <span>Agent spend today</span>
          <strong className="money-total">
            {!data
              ? "—"
              : agents.every((a) => a.asset === "HBAR")
                ? money(
                    agents
                      .reduce((sum, a) => sum + BigInt(a.spentToday), 0n)
                      .toString(),
                    "HBAR",
                  )
                : "Multiple assets"}
          </strong>
          <span>Across {agents.length} registered agents</span>
        </div>
        <div>
          <span>Safety outcomes</span>
          <strong>
            {data
              ? audit.filter(
                  (a) => a.state === "SAFE_STOP" || a.state === "CANCELLED",
                ).length
              : "—"}
            <small> stopped</small>
          </strong>
          <span>In the loaded audit records</span>
        </div>
      </div>
      {view === "devices" && (
        <>
          <div className="content-grid">
            <DeviceFleet data={data} loading={loading} now={now} />
            <SessionPanel data={data} now={now} loading={loading} />
          </div>
          <section className="flow-panel">
            <div>
              <h2>From payment to physical access</h2>
              <p>A verifiable path for every minute of use.</p>
            </div>
            <div className="flow">
              <span>
                <ArrowDownLeft size={17} />
                x402 payment
              </span>
              <ChevronRight size={13} />
              <span>
                <ShieldCheck size={17} />
                0G decision
              </span>
              <ChevronRight size={13} />
              <span>
                <Fingerprint size={17} />
                Signed receipt
              </span>
              <ChevronRight size={13} />
              <span>
                <Zap size={17} />
                Relay unlock
              </span>
            </div>
          </section>
        </>
      )}
      {view === "agents" && <AgentBudgets agents={agents} loading={loading} />}
      {view === "audit" && <AuditTable audit={audit} loading={loading} />}
    </AppShell>
  );
}
