"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Fingerprint } from "lucide-react";
import { fixtureMode, loadSession, startApproval } from "@/lib/gateway";
import { money } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { useSSE } from "@/lib/use-sse";
import { Button } from "./ui/button";
import { DemoScenarios } from "./demo-scenarios";
export function StepUp({ id }: { id: string }) {
  const loader = useCallback(() => loadSession(id), [id]);
  const { data, error, loading, refresh } = useResource(loader);
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  useSSE(refresh);
  const session = data?.id === id ? data : null;
  async function authorize() {
    if (!session || session.state !== "STEP_UP" || error || fixtureMode || busy)
      return;
    setBusy(true);
    setActionError("");
    try {
      const current = await loadSession(id);
      if (
        current.state !== "STEP_UP" ||
        current.deviceId !== session.deviceId ||
        current.minutes !== session.minutes ||
        current.amount !== session.amount ||
        current.asset !== session.asset
      )
        throw new Error(
          "The action changed. Refresh and review it before approving.",
        );
      window.location.assign(await startApproval(id));
    } catch (failure) {
      setActionError(
        failure instanceof Error
          ? failure.message
          : "Approval could not start.",
      );
      setBusy(false);
    }
  }
  return (
    <main id="main" className="session-page approval-page">
      <Link className="back-link" href={`/sessions/${encodeURIComponent(id)}`}>
        <ArrowLeft size={15} />
        Session receipt
      </Link>
      <div className="approval-heading">
        <Fingerprint size={30} />
        <h1>Human approval</h1>
        <p className="muted">
          Review the exact action your agent is requesting.
        </p>
      </div>
      {fixtureMode && (
        <>
          <div className="mode-notice">
            Demo workspace · approvals below are simulated
          </div>
          <DemoScenarios />
        </>
      )}
      {(error || actionError) && (
        <div role="alert" className="error">
          {error || actionError}{" "}
          <button onClick={refresh}>Refresh session</button>
        </div>
      )}
      {session ? (
        <section className="session-panel">
          <div className="section-heading">
            <h2>Requested device access</h2>
            <span className="status">{session.state.replaceAll("_", " ")}</span>
          </div>
          <dl>
            <div>
              <dt>Session</dt>
              <dd>{session.id}</dd>
            </div>
            <div>
              <dt>Device</dt>
              <dd>{session.deviceId}</dd>
            </div>
            <div>
              <dt>Agent</dt>
              <dd>{session.agentId}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{session.minutes} minutes</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{money(session.amount, session.asset)}</dd>
            </div>
          </dl>
          {session.state !== "STEP_UP" ? (
            <p className="muted">
              This session is not awaiting human approval.{" "}
              <Link href={`/sessions/${encodeURIComponent(id)}`}>
                View its current state.
              </Link>
            </p>
          ) : fixtureMode ? (
            <>
              <p className="muted">
                Preview an approval outcome. These previews never change device
                access.
              </p>
              <nav
                className="approval-actions"
                aria-label="Preview approval outcome"
              >
                {["APPROVED", "DENIED", "EXPIRED"].map((result) => (
                  <Link
                    key={result}
                    className="button outline"
                    href={`/demo/approval/${result}?sessionId=${encodeURIComponent(id)}`}
                  >
                    Preview {result}
                  </Link>
                ))}
              </nav>
            </>
          ) : (
            <>
              <p className="muted">
                Continue to World ID to authorize this exact action. Human
                approval alone does not unlock the device.
              </p>
              <Button
                onClick={authorize}
                disabled={busy || loading || Boolean(error)}
              >
                {busy ? "Opening World ID…" : "Continue to World ID"}
              </Button>
            </>
          )}
        </section>
      ) : (
        !error && (
          <div role="status" className="empty">
            Loading requested action…
          </div>
        )
      )}
    </main>
  );
}
