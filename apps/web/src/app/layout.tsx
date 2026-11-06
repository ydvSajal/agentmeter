import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AgentMeter — Metered device access",
  description:
    "Metered access to physical devices. Agent payments, human guardrails, verifiable receipts.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
