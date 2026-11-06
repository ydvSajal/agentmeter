import Link from "next/link";
import {
  Activity,
  Cpu,
  LayoutGrid,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
export type View = "devices" | "agents" | "audit";
export const titles = {
  devices: "Devices",
  agents: "Agents",
  audit: "Audit trail",
};
export function AppShell({
  view,
  children,
}: {
  view: View;
  children: React.ReactNode;
}) {
  const nav = [
    { view: "devices", href: "/devices", icon: LayoutGrid },
    { view: "agents", href: "/agents", icon: Cpu },
    { view: "audit", href: "/audit", icon: Activity },
  ] as const;
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="rail">
        <Link className="mark" href="/" aria-label="AgentMeter home">
          <span />
          <span />
          <span />
        </Link>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <Link
              key={n.view}
              href={n.href}
              title={titles[n.view]}
              aria-label={titles[n.view]}
              aria-current={view === n.view ? "page" : undefined}
            >
              <n.icon size={19} />
              <span>{titles[n.view]}</span>
            </Link>
          ))}
        </nav>
        <div className="rail-bottom">
          <ShieldCheck size={18} />
          <span className="avatar">AM</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Link href="/" className="wordmark">
            agent<span>meter</span>
            <span className="wordmark-dot">.</span>
          </Link>
          <div className="breadcrumb">
            Mumbai lab <ChevronRight size={13} /> {titles[view]}
          </div>
          <span className="network">
            <span className="status-dot" />
            Hedera testnet
          </span>
          <Link href="/docs" className="dashboard-docs">
            Docs
          </Link>
          <span className="top-avatar">S</span>
        </header>
        <main id="main">
          {children}
          <footer>
            <span>
              AgentMeter{" "}
              <span className="muted">/ Built for the physical world</span>
            </span>
            <span className="muted">x402 · Hedera · 0G · World</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
