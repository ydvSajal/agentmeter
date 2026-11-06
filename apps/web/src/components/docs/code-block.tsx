"use client";
import { useState } from "react";
export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const [status, setStatus] = useState("Copy");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus("Copied");
      setTimeout(() => setStatus("Copy"), 2000);
    } catch {
      setStatus("Select text to copy");
    }
  }
  return (
    <div className="docs-code">
      <div className="docs-code-head">
        <span>{language || "text"}</span>
        <button onClick={copy} aria-label="Copy code">
          {status}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
