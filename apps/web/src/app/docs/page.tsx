import type { Metadata } from "next";
import Link from "next/link";
import { documents } from "@/lib/docs";
import { ArchitectureMap } from "@/components/docs/architecture-map";
export const metadata: Metadata = {
  title: "Documentation | AgentMeter",
  description:
    "Public AgentMeter guides: setup, architecture, API contracts, testing and project specifications. No login required.",
};
export default function Page() {
  return (
    <main id="docs-main" className="docs-index">
      <div className="docs-breadcrumb">AgentMeter / Documentation</div>
      <h1>Understand the switch.</h1>
      <p className="docs-lead">
        Everything from your first local run to the device’s last paid minute.
        Open documentation, no account required.
      </p>
      <div className="docs-start">
        <div>
          <h2>Start with a working demo.</h2>
          <p>
            Run the frontend with sample devices, explore receipts and budgets,
            then connect your gateway when it is ready.
          </p>
          <Link className="public-button" href="/docs/getting-started">
            Get started <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <pre>
          <code>
            {
              "pnpm install\npnpm --filter @agentmeter/web dev\n\n# Open http://127.0.0.1:3000"
            }
          </code>
        </pre>
      </div>
      <ArchitectureMap />
      <section className="docs-guide-index">
        <h2>Find your next step.</h2>
        {[...new Set(documents.map((document) => document.group))].map(
          (group) => (
            <div className="docs-index-group" key={group}>
              <h3>{group}</h3>
              <div>
                {documents
                  .filter((document) => document.group === group)
                  .map((document) => (
                    <Link href={`/docs/${document.slug}`} key={document.slug}>
                      <strong>
                        {document.title}
                        <span aria-hidden="true">↗</span>
                      </strong>
                      <p>{document.description}</p>
                    </Link>
                  ))}
              </div>
            </div>
          ),
        )}
      </section>
      <div className="docs-integration-note">
        <h2>A note on integration.</h2>
        <p>
          The frontend works with fixtures and the HTTP/SSE contract harness.
          Real payments, identity verification and hardware depend on the
          gateway integrations.{" "}
          <Link href="/docs/status">Read the verified frontend status.</Link>
        </p>
      </div>
    </main>
  );
}
