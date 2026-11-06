import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import type { AuditRow } from "@agentmeter/shared/src/schemas";
export function AuditTable({
  audit,
  loading,
}: {
  audit: AuditRow[];
  loading: boolean;
}) {
  return (
    <section className="list-panel">
      <div className="section-heading">
        <h2>Session records</h2>
        <span className="muted">Latest {audit.length} records</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Session</th>
              <th>State</th>
              <th>Hedera transaction</th>
              <th>HCS sequence</th>
              <th>0G request / root</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.sessionId}>
                <td>
                  <Link href={`/sessions/${encodeURIComponent(a.sessionId)}`}>
                    {a.sessionId} <ArrowUpRight size={12} />
                  </Link>
                  <small>{new Date(a.at * 1000).toLocaleTimeString()}</small>
                </td>
                <td>
                  <span
                    className={`status ${a.state === "SAFE_STOP" || a.state === "CANCELLED" ? "stopped" : ""}`}
                  >
                    {a.state.replaceAll("_", " ")}
                  </span>
                </td>
                <td>
                  {a.hederaTxId ? (
                    <a
                      href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(a.hederaTxId)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.hederaTxId}
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="num">{a.hcsSeq ?? "—"}</td>
                <td>
                  <code>{a.zgRequestId ?? "—"}</code>
                  <small className="hash">
                    {a.zgRootHash ?? "No storage root"}
                  </small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !audit.length && (
        <div className="empty">No session records yet.</div>
      )}
      {loading && !audit.length && (
        <div className="empty" role="status">
          Loading audit records…
        </div>
      )}
    </section>
  );
}
