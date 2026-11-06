"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
export type NavDocument = {
  slug: string;
  title: string;
  group: string;
  description: string;
};
export function DocsNavigation({ documents }: { documents: NavDocument[] }) {
  const pathname = usePathname(),
    [query, setQuery] = useState("");
  const visible = documents.filter((document) =>
    `${document.title} ${document.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="docs-nav-inner">
      <Link href="/docs" className="docs-nav-title">
        Documentation
      </Link>
      <label className="docs-search">
        <span className="sr-only">Find a guide</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          placeholder="Find a guide…"
          aria-label="Find a documentation guide"
        />
      </label>
      <nav aria-label="Documentation">
        {[...new Set(visible.map((document) => document.group))].map(
          (group) => (
            <div key={group} className="docs-nav-group">
              <span>{group}</span>
              {visible
                .filter((document) => document.group === group)
                .map((document) => (
                  <Link
                    key={document.slug}
                    href={`/docs/${document.slug}`}
                    aria-current={
                      pathname === `/docs/${document.slug}` ? "page" : undefined
                    }
                  >
                    {document.title}
                  </Link>
                ))}
            </div>
          ),
        )}
      </nav>
      {!visible.length && (
        <p className="docs-no-results">No guides match “{query}”.</p>
      )}
      <Link className="docs-nav-back" href="/devices">
        Open dashboard ↗
      </Link>
    </div>
  );
}
