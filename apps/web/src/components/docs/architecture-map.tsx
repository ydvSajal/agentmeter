const nodes = [
  { name: "Browser", detail: "Dashboard · receipts · human review" },
  { name: "Gateway", detail: "Payment · policy · session orchestration" },
  { name: "Verification", detail: "Hedera · 0G · World ID" },
  { name: "Device", detail: "Signed receipt · local timer · relay" },
];
export function ArchitectureMap() {
  return (
    <figure className="docs-system-map">
      <figcaption>From intent to physical access</figcaption>
      <ol>
        {nodes.map((node) => (
          <li key={node.name}>
            <strong>{node.name}</strong>
            <span>{node.detail}</span>
          </li>
        ))}
      </ol>
      <p>The browser observes. The gateway authorizes. The device enforces.</p>
    </figure>
  );
}
