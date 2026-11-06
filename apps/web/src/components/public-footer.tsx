import Link from "next/link";
export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div>
        <Link href="/" className="public-brand">
          agentmeter.
        </Link>
        <p>
          Agents in the physical world.
          <br />A receipt for every minute.
        </p>
      </div>
      <nav aria-label="Footer navigation">
        <Link href="/devices">Device dashboard</Link>
        <Link href="/docs">Documentation</Link>
        <Link href="/docs/architecture">Architecture</Link>
        <Link href="/docs/api">API reference</Link>
        <a
          href="https://github.com/ydvSajal/agentmeter"
          target="_blank"
          rel="noreferrer"
        >
          Source code
        </a>
      </nav>
      <div className="public-colophon">
        <span>Built at ETHGlobal Mumbai · 2026</span>
        <span>x402 / Hedera / 0G / World ID</span>
      </div>
    </footer>
  );
}
