import { Fragment, createElement, type ReactNode } from "react";
import type { Document } from "@/lib/docs";
import { headingId, resolveDocLink } from "@/lib/docs";
import { CodeBlock } from "./code-block";
import { Diagram } from "./diagram";

function inline(text: string, document: Document): ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g);
  return tokens.map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`"))
      return <code key={index}>{token.slice(1, -1)}</code>;
    if (token.startsWith("**") && token.endsWith("**"))
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\((.+)\)$/.exec(token);
    if (link) {
      const href = resolveDocLink(link[2]!, document);
      return href ? (
        <a
          key={index}
          href={href}
          {...(href.startsWith("http")
            ? { target: "_blank", rel: "noreferrer" }
            : {})}
        >
          {inline(link[1]!, document)}
        </a>
      ) : (
        <span key={index}>{link[1]}</span>
      );
    }
    return <Fragment key={index}>{token}</Fragment>;
  });
}
/** Small, escaped Markdown renderer for the repository's trusted documentation. No raw HTML execution. */
export function Markdown({
  content,
  document,
}: {
  content: string;
  document: Document;
}) {
  const lines = content.replace(/\r\n/g, "\n").split("\n"),
    blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim() || /^---+$/.test(line)) {
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```"))
        body.push(lines[i++]!);
      i++;
      if (language === "mermaid") {
        blocks.push(<Diagram key={i} code={body.join("\n")} />);
      } else
        blocks.push(
          <CodeBlock key={i} code={body.join("\n")} language={language} />,
        );
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      i++;
      if (heading[1]!.length === 1) continue;
      const level = Math.min(4, heading[1]!.length);
      blocks.push(
        createElement(
          `h${level}`,
          { key: i, id: headingId(heading[2]!) },
          inline(heading[2]!, document),
        ),
      );
      continue;
    }
    if (
      line.trim().startsWith("|") &&
      /^\s*\|?[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")
    ) {
      const cells = (row: string) => {
        const result: string[] = [];
        let cell = "",
          quoted = false;
        for (const char of row.trim().replace(/^\||\|$/g, "")) {
          if (char === "`") quoted = !quoted;
          if (char === "|" && !quoted) {
            result.push(cell.trim());
            cell = "";
          } else cell += char;
        }
        result.push(cell.trim());
        return result;
      };
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|"))
        rows.push(cells(lines[i++]!));
      blocks.push(
        <div key={i} className="docs-table">
          <table>
            <thead>
              <tr>
                {head.map((cell, index) => (
                  <th key={index}>{inline(cell, document)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, col) => (
                    <td key={col}>{inline(cell, document)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-*]\s+|^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line),
        items: ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+|^\s*\d+[.)]\s+/.test(lines[i]!)) {
        items.push(
          <li key={i}>
            {inline(
              lines[i++]!.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""),
              document,
            )}
          </li>,
        );
      }
      blocks.push(
        ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>,
      );
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">"))
        quote.push(lines[i++]!.replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={i}>{inline(quote.join(" "), document)}</blockquote>,
      );
      continue;
    }
    const paragraph: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,6}\s|```|\s*[-*]\s|\s*\d+[.)]\s|\||>)/.test(lines[i]!)
    )
      paragraph.push(lines[i++]!);
    blocks.push(<p key={i}>{inline(paragraph.join(" "), document)}</p>);
  }
  return <div className="docs-prose">{blocks}</div>;
}
