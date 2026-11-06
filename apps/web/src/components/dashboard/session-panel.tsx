import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Fan,
  Fingerprint,
  ShieldCheck,
} from "lucide-react";
import type { DashboardData } from "@/lib/gateway";
import { accessGate, money, secondsRemaining } from "@/lib/format";
export function SessionPanel({
  data,
  now,
  loading,
}: {
  data?: DashboardData;
  now: number;
  loading: boolean;
}) {
  const session = data?.session ?? null;
  const remaining = secondsRemaining(session, now);
  const unlocked = accessGate(session, now, data?.sessionStale);
  return (
    <aside className="right-column">
      <section className="session-panel">
        <div className="section-heading">
          <h2>Latest live session</h2>
          {session && <span className="status-dot" />}
        </div>
        {session ? (
          <>
            <div className="session-device">
              <Fan size={18} />
              <div>
                <b>
                  {data?.devices.find((d) => d.id === session.deviceId)?.name ??
                    session.deviceId}
                </b>
                <span>{session.id}</span>
              </div>
              <Link
                aria-label="Open active session"
                href={`/sessions/${encodeURIComponent(session.id)}`}
              >
                <ArrowUpRight size={18} />
              </Link>
            </div>
            <div className="countdown-label">
              {session.state === "ACTIVE"
                ? "Access expires in"
                : "Awaiting authorization"}
            </div>
            <div className="countdown">
              {String(Math.floor(remaining / 60)).padStart(2, "0")}
              <span>:</span>
              {String(remaining % 60).padStart(2, "0")}
              <small>min / sec</small>
            </div>
            <progress
              aria-label="Session time remaining"
              max={session.minutes * 60}
              value={Math.min(session.minutes * 60, remaining)}
            />
            <dl>
              <div>
                <dt>Agent</dt>
                <dd>
                  {data?.agents.find((a) => a.id === session.agentId)?.name ??
                    session.agentId}
                </dd>
              </div>
              <div>
                <dt>Session amount</dt>
                <dd>{money(session.amount, session.asset)}</dd>
              </div>
              <div>
                <dt>Access gate</dt>
                <dd>
                  {unlocked
                    ? "Unlocked"
                    : data?.sessionStale
                      ? "Unverified"
                      : "Locked"}
                </dd>
              </div>
            </dl>
            <Link
              className="session-link"
              href={
                session.state === "STEP_UP"
                  ? `/step-up/${encodeURIComponent(session.id)}`
                  : `/sessions/${encodeURIComponent(session.id)}`
              }
            >
              {session.state === "STEP_UP"
                ? "Review human approval"
                : "Inspect receipt"}
              <ArrowRight size={14} />
            </Link>
          </>
        ) : (
          <div className="empty">
            {loading
              ? "Loading latest session…"
              : data?.sessionStale
                ? "Session could not be verified. Retry refresh."
                : "No live session in the latest audit records."}
          </div>
        )}
      </section>
      <section className="guardrail">
        <ShieldCheck size={18} />
        <h3>Autonomy with a stop switch.</h3>
        <p>
          Every unlock needs a signed receipt. If the decision service fails,
          access stops safely.
        </p>
        <div>
          <Fingerprint size={14} />
          World ID for step-up approval
        </div>
      </section>
    </aside>
  );
}
