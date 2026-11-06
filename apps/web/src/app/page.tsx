import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { HeroFolders } from "@/components/landing/hero-folders";
import { ReceiptPlayground } from "@/components/landing/receipt-playground";
import { LandingMotion } from "@/components/landing/motion";
import "./public.css";
export const metadata: Metadata = {
  title: "AgentMeter | Agents, meet hardware",
  description:
    "Pay-per-minute physical device access for AI agents. Signed receipts, spending limits, human approvals and public documentation.",
};
export default function Page() {
  return (
    <div className="public-site">
      <a className="skip-link" href="#public-main">
        Skip to content
      </a>
      <PublicHeader />
      <main id="public-main" className="public-main">
        <section className="landing-hero">
          <h1>
            Agents, meet
            <br />
            hardware.
          </h1>
          <p>
            Give agents metered access to physical devices, with signed receipts
            and a human in the loop.
          </p>
          <div className="hero-actions">
            <Link className="public-button" href="/devices">
              Open dashboard <span aria-hidden="true">↗</span>
            </Link>
            <Link className="public-text-link" href="/docs">
              Read the docs
            </Link>
          </div>
          <HeroFolders />
        </section>
        <div className="protocol-band" aria-label="Technology roles">
          <span>
            <b>x402</b>Payment protocol
          </span>
          <span>
            <b>Hedera</b>Settlement & audit
          </span>
          <span>
            <b>0G</b>Decision & storage
          </span>
          <span>
            <b>World ID</b>Human approval
          </span>
        </div>
        <section id="how-it-works" className="landing-flow public-section">
          <div className="section-intro">
            <h2 className="landing-reveal">
              A payment.
              <br />A real switch.
            </h2>
            <p className="landing-reveal">
              From an agent’s request to a physical relay, every handoff has a
              check. Walk through the flow and set the minutes.
            </p>
          </div>
          <ReceiptPlayground />
        </section>
        <section className="landing-proof public-section">
          <div className="proof-intro">
            <h2 className="landing-reveal">
              Every minute,
              <br />
              accounted for.
            </h2>
            <p className="landing-reveal">
              See what a device is doing, what an agent is spending, and which
              decisions led there. One workspace, with the evidence attached.
            </p>
          </div>
          <div className="proof-screens">
            <figure className="landing-reveal spend-shot">
              <div className="product-picture" data-ui>
                <img
                  src="/media/agents.jpg"
                  alt="Agent budgets showing spend and remaining allowance for three sample agents"
                  width="1440"
                  height="1000"
                  loading="lazy"
                />
              </div>
              <figcaption>
                <h3>Budgets before access.</h3>
                <p>
                  Daily caps and exact base-unit amounts keep agent spending
                  legible.
                </p>
                <Link href="/agents">Explore agent budgets</Link>
              </figcaption>
            </figure>
            <figure className="landing-reveal audit-shot">
              <div className="product-picture" data-ui>
                <img
                  src="/media/audit.jpg"
                  alt="Audit records with active, step-up, settled, safe-stop and cancelled session states"
                  width="1440"
                  height="1000"
                  loading="lazy"
                />
              </div>
              <figcaption>
                <h3>A trace for each decision.</h3>
                <p>
                  Inspect session states, Hedera transactions, HCS sequences and
                  0G evidence.
                </p>
                <Link href="/audit">Explore the audit trail</Link>
              </figcaption>
            </figure>
          </div>
        </section>
        <section className="landing-safety public-section">
          <div className="safety-picture landing-reveal" data-ui>
            <img
              src="/media/receipt.jpg"
              width="1440"
              height="1200"
              loading="lazy"
              alt="A safe-stop session receipt showing access locked and verification evidence"
            />
          </div>
          <div className="safety-copy">
            <h2 className="landing-reveal">
              Let agents act.
              <br />
              Keep the limits.
            </h2>
            <div className="safety-reason landing-reveal">
              <h3>Time is part of the receipt.</h3>
              <p>
                The device verifies the signature and expiry locally. Access
                lasts only for the time the receipt allows.
              </p>
            </div>
            <div className="safety-reason landing-reveal">
              <h3>A human when it matters.</h3>
              <p>
                Requests above a spending threshold pause for World ID step-up
                approval of the exact device, duration and amount.
              </p>
            </div>
            <div className="safety-reason landing-reveal">
              <h3>Failure means stop.</h3>
              <p>
                If a required decision fails, the gateway enters SAFE_STOP. The
                interface shows the reason and keeps access locked.
              </p>
            </div>
            <Link className="public-text-link" href="/docs/architecture">
              Follow the architecture
            </Link>
          </div>
        </section>
        <section className="landing-docs public-section">
          <div>
            <h2 className="landing-reveal">
              Built in the open.
              <br />
              Documented, too.
            </h2>
            <p className="landing-reveal">
              Go from the big picture to the wire contract. Setup, architecture,
              API reference and demo instructions are all public.
            </p>
            <Link className="public-button dark" href="/docs">
              Browse documentation <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <nav aria-label="Documentation guides" className="doc-guide-links">
            <Link className="landing-reveal" href="/docs/getting-started">
              <span>Get it running</span>
              <small>Install, configure and explore the demo</small>
              <b aria-hidden="true">↗</b>
            </Link>
            <Link className="landing-reveal" href="/docs/architecture">
              <span>Understand the system</span>
              <small>Boundaries, modules and approval flow</small>
              <b aria-hidden="true">↗</b>
            </Link>
            <Link className="landing-reveal" href="/docs/api">
              <span>Build against the API</span>
              <small>REST, SSE, receipts and device messages</small>
              <b aria-hidden="true">↗</b>
            </Link>
            <Link className="landing-reveal" href="/docs/testing">
              <span>Run the demo</span>
              <small>Scenarios, checks and integration limits</small>
              <b aria-hidden="true">↗</b>
            </Link>
          </nav>
        </section>
        <section className="landing-faq public-section">
          <h2 className="landing-reveal">Before you plug in.</h2>
          <div className="faq-list">
            <details className="landing-reveal">
              <summary>Can I explore without an account?</summary>
              <p>
                Yes. The dashboard and all documentation are available without
                login. The default demo uses labeled sample data and never
                initiates a real payment or device action.
              </p>
            </details>
            <details className="landing-reveal">
              <summary>Does the browser unlock a device?</summary>
              <p>
                No. The gateway checks policy, human approval when required, and
                the decision service. The device verifies a signed expiring
                receipt. The browser displays the resulting state.
              </p>
            </details>
            <details className="landing-reveal">
              <summary>What is live, and what is a demo?</summary>
              <p>
                The interface works with fixtures and an HTTP/SSE gateway
                contract. Real payments, World identity verification and
                physical hardware require the separately configured backend
                integrations. The public documentation records the current
                integration status.
              </p>
            </details>
            <details className="landing-reveal">
              <summary>Where do I start as a developer?</summary>
              <p>
                Read <Link href="/docs/getting-started">the setup guide</Link>,
                then explore{" "}
                <Link href="/docs/architecture">the architecture</Link> and{" "}
                <Link href="/docs/api">API reference</Link>. The source is
                TypeScript with a Next.js frontend and a separate gateway.
              </p>
            </details>
          </div>
        </section>
        <section className="landing-close public-section">
          <h2 className="landing-reveal">Try the switch.</h2>
          <p>
            Explore the device fleet. Follow a receipt. See where access stops.
          </p>
          <Link className="public-button" href="/devices">
            Open dashboard <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>
      <PublicFooter />
      <LandingMotion />
    </div>
  );
}
