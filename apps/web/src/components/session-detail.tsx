"use client";
import { useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { fixtureMode, loadSession } from "@/lib/gateway";
import { accessGate, hashscanUrl, money, secondsRemaining } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { useClock } from "@/lib/use-clock";
import { useSSE } from "@/lib/use-sse";
import { Button } from "./ui/button";
import { DemoScenarios } from "./demo-scenarios";
const explanations = {
  PENDING: "Payment and policy checks are pending. Access remains locked.",
  STEP_UP:
    "A human must approve the exact action before the gateway can continue.",
  DECIDING:
    "The decision service is evaluating this request. Access remains locked.",
  ISSUED: "A signed receipt was issued. Waiting for the device acknowledgment.",
  ACTIVE: "The gateway reports active access until the signed receipt expires.",
  SETTLED:
    "This session completed. Review its transaction and decision evidence below.",
  CANCELLED: "Access cancelled. No access is granted by this session.",
  SAFE_STOP:
    "Access stopped safely. A required check failed; access remains locked.",
};
export function SessionDetail({ id }: { id: string }) {
  const loader = useCallback(() => loadSession(id), [id]);
  const { data, error, loading, updated, refresh } = useResource(loader);
  const connected = useSSE(refresh),
    now = useClock();
  const session = data?.id === id ? data : null;
  const seconds = secondsRemaining(session, now);
  const unlocked = accessGate(session, now, Boolean(error));
  return (
    <main id="main" className="session-page">
      <Link className="back-link" href="/devices">
        <ArrowLeft size={15} />
        Device control
      </Link>
      <div className="page-heading">
        <div>
          <div className="context">AgentMeter / Session</div>
          <h1>Session receipt</h1>
          <p className="opaque-id">{id}</p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spinning" : ""} />
          Refresh
        </Button>
      </div>
      <div className="mode-notice">
        <span>
          {fixtureMode
            ? "Demo session · no real device action"
            : connected
              ? "Live event stream"
              : "Reconnecting · polling every 15s"}
        </span>
        {updated && (
          <span className="freshness">
            Checked {updated.toLocaleTimeString()}
          </span>
        )}
      </div>
      {fixtureMode && <DemoScenarios />}
      {error && (
        <div role="alert" className="error">
          {error} Access cannot be verified.{" "}
          <button onClick={refresh}>Retry</button>
        </div>
      )}
      {session ? (
        <>
          <section
            role={
              session.state === "SAFE_STOP" || session.state === "CANCELLED"
                ? "alert"
                : "status"
            }
            className={`session-outcome ${session.state === "SAFE_STOP" || session.state === "CANCELLED" ? "session-banner" : ""}`}
          >
            <ShieldCheck size={18} />
            <div>
              <strong>{session.state.replaceAll("_", " ")}</strong>
              <p>{explanations[session.state]}</p>
            </div>
          </section>
          <section className="session-panel">
            <div className="section-heading">
              <h2 className="gate-label">
                <LockKeyhole size={16} />
                {unlocked ? "Access unlocked" : "Access locked"}
              </h2>
              <span className="muted">{session.deviceId}</span>
            </div>
            <div className="countdown-label">
              {session.expiresAt === null
                ? "No active receipt expiry"
                : seconds === 0
                  ? "Receipt expired"
                  : "Receipt time remaining"}
            </div>
            <div className="countdown">
              {String(Math.floor(seconds / 60)).padStart(2, "0")}
              <span>:</span>
              {String(seconds % 60).padStart(2, "0")}
              <small>min / sec</small>
            </div>
            <progress
              aria-label="Receipt time remaining"
              value={Math.min(session.minutes * 60, seconds)}
              max={session.minutes * 60}
            />
            <dl>
              <div>
                <dt>Device</dt>
                <dd>{session.deviceId}</dd>
              </div>
              <div>
                <dt>Agent</dt>
                <dd>{session.agentId}</dd>
              </div>
              <div>
                <dt>Requested duration</dt>
                <dd>{session.minutes} minutes</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{money(session.amount, session.asset)}</dd>
              </div>
              <div>
                <dt>Receipt expires</dt>
                <dd>
                  {session.expiresAt === null
                    ? "Not issued"
                    : new Date(session.expiresAt * 1000).toLocaleString()}
                </dd>
              </div>
            </dl>
            {session.state === "STEP_UP" && (
              <Link
                className="session-link"
                href={`/step-up/${encodeURIComponent(id)}`}
              >
                Review human approval →
              </Link>
            )}
          </section>
          <div className="receipt-grid">
            <section className="list-panel">
              <h2>State timeline</h2>
              <ol className="event-list">
                {session.events.length ? (
                  session.events.map((event, index) => (
                    <li key={`${event.at}-${index}`}>
                      <span className="event-dot" />
                      <div>
                        <strong>{event.state.replaceAll("_", " ")}</strong>
                        <p>
                          {event.detail ?? "No additional detail recorded."}
                        </p>
                        <time
                          dateTime={new Date(event.at * 1000).toISOString()}
                        >
                          {new Date(event.at * 1000).toLocaleTimeString()}
                        </time>
                      </div>
                    </li>
                  ))
                ) : (
                  <li>No events recorded.</li>
                )}
              </ol>
            </section>
            <section className="list-panel">
              <h2>Verification evidence</h2>
              <dl className="evidence">
                <div>
                  <dt>Hedera transaction</dt>
                  <dd>
                    {session.hederaTxId ? (
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={hashscanUrl(session.hederaTxId)}
                      >
                        {session.hederaTxId}
                        <ExternalLink size={13} />
                      </a>
                    ) : (
                      "Not recorded"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>HCS sequence</dt>
                  <dd>{session.hcsSeq ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>0G request ID</dt>
                  <dd>
                    <code>{session.zgRequestId ?? "Not recorded"}</code>
                  </dd>
                </div>
                <div>
                  <dt>0G storage root</dt>
                  <dd>
                    <code>{session.zgRootHash ?? "Not recorded"}</code>
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      ) : (
        !error && (
          <div className="loading-layout" role="status">
            Loading session receipt…
            <div />
            <div />
            <div />
          </div>
        )
      )}
    </main>
  );
}
