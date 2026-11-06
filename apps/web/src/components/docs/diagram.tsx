import { CodeBlock } from "./code-block";
function clean(text: string) {
  return text
    .replace(/<br\s*\/?>/g, " · ")
    .replace(/\\n/g, " · ")
    .replace(/^"|"$/g, "");
}
/** Render repository flow/sequence edges as accessible labeled relationships. */
export function Diagram({ code }: { code: string }) {
  const names = new Map<string, string>();
  for (const match of code.matchAll(/\b([A-Za-z]\w*)\[([^\]]+)\]/g))
    names.set(match[1]!, clean(match[2]!));
  for (const match of code.matchAll(
    /participant\s+(\w+)(?:\s+as\s+([^\n]+))?/g,
  ))
    names.set(match[1]!, clean(match[2] ?? match[1]!));
  const edges: { from: string; to: string; label: string }[] = [];
  for (const row of code.split("\n")) {
    const sequence = /^\s*(\w+)(?:-->>|->>)(\w+):\s*(.*)/.exec(row);
    if (sequence) {
      edges.push({ from: sequence[1]!, to: sequence[2]!, label: sequence[3]! });
      continue;
    }
    const flow =
      /^\s*(\w+)(?:\[[^\]]+\])?\s*(?:-->|-\.->|==>)\s*(?:\|([^|]+)\|\s*)?(\w+)/.exec(
        row,
      );
    if (flow)
      edges.push({ from: flow[1]!, to: flow[3]!, label: flow[2] ?? "" });
    const dashed = /^\s*(\w+)\s*-\.\s+(.+?)\s+\.->\s*(\w+)/.exec(row);
    if (dashed)
      edges.push({ from: dashed[1]!, to: dashed[3]!, label: dashed[2]! });
  }
  return (
    <figure className="docs-flow">
      <figcaption>
        {code.includes("sequenceDiagram")
          ? "Sequence of operations"
          : "System relationships"}
      </figcaption>
      <ol className="diagram-edges">
        {edges.map((edge, index) => (
          <li key={index}>
            <span>{names.get(edge.from) ?? edge.from}</span>
            <div>
              <small>{edge.label}</small>
              <b aria-hidden="true">→</b>
            </div>
            <span>{names.get(edge.to) ?? edge.to}</span>
          </li>
        ))}
      </ol>
      <details>
        <summary>View original Mermaid diagram source</summary>
        <CodeBlock code={code} language="mermaid" />
      </details>
    </figure>
  );
}
