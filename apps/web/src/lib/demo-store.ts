import { fixtures } from "./fixtures";
let sample: ReturnType<typeof fixtures> | undefined;
/** One time origin per tab keeps list/detail countdowns consistent. */
export function demoData() {
  if (sample) return sample;
  let epoch = Math.floor(Date.now() / 1000);
  if (typeof window !== "undefined") {
    try {
      const stored = Number(sessionStorage.getItem("agentmeter-demo-epoch"));
      if (stored > 0 && Number.isInteger(stored) && stored <= epoch)
        epoch = stored;
      else sessionStorage.setItem("agentmeter-demo-epoch", String(epoch));
    } catch {
      /* Storage can be disabled; the in-memory epoch still works. */
    }
  }
  return (sample = fixtures(epoch));
}
export function demoSession(id: string) {
  const session = demoData().sessions.find((session) => session.id === id);
  if (!session) throw new Error("Session not found in this demo workspace.");
  return session;
}
