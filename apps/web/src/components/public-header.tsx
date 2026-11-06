import Link from "next/link";
export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="public-brand" href="/" aria-label="AgentMeter home">
        <span className="public-symbol" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        agentmeter.
      </Link>
      <nav aria-label="Public navigation">
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/docs">Documentation</Link>
        <a
          href="https://github.com/ydvSajal/agentmeter"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </nav>
      <Link className="public-button small" href="/devices">
        Open dashboard <span aria-hidden="true">↗</span>
      </Link>
    </header>
  );
}
