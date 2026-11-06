import { describe, it, expect } from "vitest";
import {
  documents,
  readDocument,
  resolveDocLink,
  documentHeadings,
} from "../src/lib/docs";
describe("public documentation", () => {
  it("serves every allowlisted guide from a real nonempty source", () => {
    expect(new Set(documents.map((document) => document.slug)).size).toBe(
      documents.length,
    );
    for (const document of documents) {
      const page = readDocument(document.slug);
      expect(page?.content.length).toBeGreaterThan(100);
      expect(documentHeadings(page!.content).length).toBeGreaterThan(0);
    }
  });
  it("does not permit arbitrary filesystem reads", () => {
    expect(readDocument("../../.env")).toBeNull();
    expect(readDocument("CLAUDE")).toBeNull();
    expect(readDocument("missing")).toBeNull();
  });
  it("resolves source-relative guide links into public routes and rejects unsafe schemes", () => {
    const architecture = documents.find(
      (document) => document.slug === "architecture",
    )!;
    expect(resolveDocLink("DEVELOPMENT.md", architecture)).toBe(
      "/docs/getting-started",
    );
    expect(resolveDocLink("#system-map", architecture)).toBe("#system-map");
    expect(resolveDocLink("javascript:alert(1)", architecture)).toBeNull();
    expect(resolveDocLink("//example.com", architecture)).toBeNull();
    expect(resolveDocLink("https://example.com", architecture)).toBe(
      "https://example.com",
    );
  });
  it("does not mistake fenced code headings for table-of-contents entries", () => {
    expect(
      documentHeadings(
        "## Real heading\n```sh\n## code comment\n```\n### Next step",
      ),
    ).toEqual([
      { level: 2, text: "Real heading", id: "real-heading" },
      { level: 3, text: "Next step", id: "next-step" },
    ]);
  });
});
