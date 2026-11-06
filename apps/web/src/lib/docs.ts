import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const documents = [
  {
    slug: "deployment",
    title: "Deployment",
    group: "Build",
    description:
      "Vercel frontend, Render gateway, Neon persistence and callback settings.",
    file: "../../docs/DEPLOY.md",
  },
  {
    slug: "firmware",
    title: "Device firmware",
    group: "Build",
    description:
      "ESP32-S3 setup, verified receipts, TLS, the OLED and on-board tests.",
    file: "../../firmware/esp32/README.md",
  },
  {
    slug: "world-debrief",
    title: "World ID integration",
    group: "Project",
    description:
      "Exact-action approval, callback configuration and live evidence still to collect.",
    file: "../../docs/WORLD_DEBRIEF.md",
  },
  {
    slug: "getting-started",
    title: "Getting started",
    group: "Start here",
    description:
      "Run AgentMeter locally and configure fixture or gateway mode.",
    file: "docs/DEVELOPMENT.md",
  },
  {
    slug: "dashboard",
    title: "Using the dashboard",
    group: "Start here",
    description:
      "Devices, session states, budgets, audit evidence and human approval.",
    file: "docs/DASHBOARD.md",
  },
  {
    slug: "overview",
    title: "Frontend overview",
    group: "Start here",
    description:
      "Screens, commands, design direction and frontend responsibilities.",
    file: "README.md",
  },
  {
    slug: "architecture",
    title: "Frontend architecture",
    group: "Architecture",
    description:
      "System boundaries, module map, data lifecycle and World approval flow.",
    file: "docs/ARCHITECTURE.md",
  },
  {
    slug: "system-architecture",
    title: "System architecture",
    group: "Architecture",
    description:
      "L0–L3 layers, adapter ports, lane ownership and integration seams.",
    file: "../../docs/ARCHITECTURE.md",
  },
  {
    slug: "api",
    title: "API & wire contracts",
    group: "Build",
    description:
      "REST endpoints, SSE events, device messages and signed receipts.",
    file: "../../docs/API.md",
  },
  {
    slug: "testing",
    title: "Testing & demo",
    group: "Build",
    description:
      "Test commands, scenario walkthrough and frontend acceptance checks.",
    file: "docs/TESTING.md",
  },
  {
    slug: "technical-spec",
    title: "Technical specification",
    group: "Build",
    description:
      "Functional requirements, timeouts, invariants and failure behavior.",
    file: "../../TRD.md",
  },
  {
    slug: "product",
    title: "Product specification",
    group: "Project",
    description:
      "The problem, target users, MVP scope and end-to-end product requirements.",
    file: "../../PRD.md",
  },
  {
    slug: "decisions",
    title: "Engineering decisions",
    group: "Project",
    description: "The recorded tradeoffs behind the system design.",
    file: "../../docs/DECISIONS.md",
  },
  {
    slug: "workflow",
    title: "Development workflow",
    group: "Project",
    description:
      "Parallel lanes, ownership, contract changes and integration gates.",
    file: "../../docs/WORKFLOW.md",
  },
  {
    slug: "scope",
    title: "Scope & milestones",
    group: "Project",
    description: "Project scope, shipping priorities and milestone gates.",
    file: "../../docs/SCOPE.md",
  },
  {
    slug: "resources",
    title: "Developer resources",
    group: "Project",
    description:
      "Reference projects, protocol links and implementation resources.",
    file: "../../docs/RESOURCES.md",
  },
  {
    slug: "status",
    title: "Frontend status",
    group: "Project",
    description:
      "What is implemented, what was verified and what needs backend integration.",
    file: "docs/STATUS.md",
  },
] as const;
export type Document = (typeof documents)[number];
export function webRoot() {
  return existsSync(resolve(process.cwd(), "src/app"))
    ? process.cwd()
    : resolve(process.cwd(), "apps/web");
}
export function readDocument(slug: string) {
  const document = documents.find((document) => document.slug === slug);
  if (!document) return null;
  return {
    ...document,
    content: readFileSync(resolve(webRoot(), document.file), "utf8"),
  };
}
export function headingId(text: string) {
  return text
    .toLowerCase()
    .replace(/[`*]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}
export function documentHeadings(content: string) {
  let fenced = false;
  return content.split(/\r?\n/).flatMap((line) => {
    if (line.startsWith("```")) {
      fenced = !fenced;
      return [];
    }
    const match = !fenced && /^(#{2,3})\s+(.+)$/.exec(line);
    return match
      ? [{ level: match[1]!.length, text: match[2]!, id: headingId(match[2]!) }]
      : [];
  });
}
/** Only known source documents can be resolved; never expose a filesystem path. */
export function resolveDocLink(href: string, current: Document) {
  if (href.startsWith("#")) return href;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  const [file, hash] = href.split("#");
  const absolute = resolve(webRoot(), current.file, "..", file ?? "");
  const target = documents.find(
    (document) => resolve(webRoot(), document.file) === absolute,
  );
  return target ? `/docs/${target.slug}${hash ? `#${hash}` : ""}` : null;
}
