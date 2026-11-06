import Link from "next/link";
export function DemoScenarios() {
  return (
    <details className="demo-scenarios">
      <summary>Explore demo states</summary>
      <nav aria-label="Demo session scenarios">
        <Link href="/sessions/s_workshop">Active session</Link>
        <Link href="/step-up/s_stepup">Human approval</Link>
        <Link href="/sessions/s_sample_2">Safe stop</Link>
        <Link href="/sessions/s_sample_3">Cancelled</Link>
        <Link href="/sessions/s_expired">Expired timer</Link>
      </nav>
    </details>
  );
}
