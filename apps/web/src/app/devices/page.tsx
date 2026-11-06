import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard";
export const metadata: Metadata = { title: "Device control | AgentMeter" };
export default function Page() {
  return <Dashboard view="devices" />;
}
