import Link from "next/link";
import { notFound } from "next/navigation";
import { fixtureMode } from "@/lib/config";
import { approvalCopy, isApprovalResult } from "@/lib/world-callback";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ result: string }>;
  searchParams: Promise<{ sessionId?: string }>;
}) {
  const { result } = await params;
  if (!fixtureMode || !isApprovalResult(result)) notFound();
  const { sessionId = "s_stepup" } = await searchParams;
  return (
    <main className="session-page approval-page">
      <Link href="/devices">AgentMeter / Device control</Link>
      <div className="mode-notice">Demo preview · no identity was verified</div>
      <section className="session-panel">
        <h1>{result}</h1>
        <h2>{approvalCopy[result].title}</h2>
        <p>
          {result === "APPROVED"
            ? "A real approval would allow the gateway to continue its checks. This simulated result does not unlock a device."
            : approvalCopy[result].detail}
        </p>
        <nav className="approval-actions">
          <Link
            className="button outline"
            href={`/step-up/${encodeURIComponent(sessionId)}`}
          >
            Back to action review
          </Link>
          <Link
            className="button outline"
            href={`/sessions/${encodeURIComponent(sessionId)}`}
          >
            View session
          </Link>
        </nav>
      </section>
    </main>
  );
}
