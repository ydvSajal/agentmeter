import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { documents, readDocument, documentHeadings } from "@/lib/docs";
import { Markdown } from "@/components/docs/markdown";
import { ArchitectureMap } from "@/components/docs/architecture-map";
export function generateStaticParams() {
  return documents.map((document) => ({ slug: document.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const document = documents.find((document) => document.slug === slug);
  return {
    title: document
      ? `${document.title} | AgentMeter Docs`
      : "Guide not found | AgentMeter",
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const document = readDocument(slug);
  if (!document) notFound();
  const headings = documentHeadings(document.content),
    index = documents.findIndex((item) => item.slug === slug),
    previous = documents[index - 1],
    next = documents[index + 1];
  return (
    <>
      <main id="docs-main" className="docs-article">
        <div className="docs-breadcrumb">
          <Link href="/docs">Documentation</Link> / {document.group}
        </div>
        <h1>{document.title}</h1>
        <p className="docs-lead">{document.description}</p>
        <div className="docs-page-meta">
          <span>Public guide · No login required</span>
          <a href={`/docs/${slug}/raw`} download={`${slug}.md`}>
            Download Markdown ↓
          </a>
        </div>
        {slug.includes("architecture") && <ArchitectureMap />}
        <Markdown content={document.content} document={document} />
        <nav aria-label="Previous and next guide" className="docs-pagination">
          {previous ? (
            <Link href={`/docs/${previous.slug}`}>
              <span>Previous</span>
              <strong>← {previous.title}</strong>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/docs/${next.slug}`}>
              <span>Next</span>
              <strong>{next.title} →</strong>
            </Link>
          )}
        </nav>
      </main>
      <aside className="docs-toc">
        <span>On this page</span>
        <nav aria-label="On this page">
          {headings.map((heading, index) => (
            <a
              className={heading.level === 3 ? "toc-nested" : ""}
              href={`#${heading.id}`}
              key={`${heading.id}-${index}`}
            >
              {heading.text.replace(/`/g, "")}
            </a>
          ))}
        </nav>
        <Link href="/docs">All documentation</Link>
      </aside>
    </>
  );
}
