import type { SessionView } from "@agentmeter/shared/src/schemas";
export function money(value: string, asset: string) {
  const amount = BigInt(value);
  if (asset !== "HBAR")
    return `${amount.toLocaleString("en-US")} base units (${asset})`;
  const whole = amount / 100000000n;
  const decimals = (amount % 100000000n)
    .toString()
    .padStart(8, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return `${whole.toLocaleString("en-US")}.${decimals} HBAR`;
}
export function budgetUsage(spent: string, cap: string) {
  const used = BigInt(spent),
    limit = BigInt(cap);
  const percentage =
    limit === 0n
      ? used > 0n
        ? 100
        : 0
      : Number((used * 10000n) / limit) / 100;
  return {
    percentage,
    bar: Math.min(100, percentage),
    over: used > limit,
    remaining: (used < limit ? limit - used : 0n).toString(),
    zeroCap: limit === 0n,
  };
}
export function secondsRemaining(session: SessionView | null, now: number) {
  return session?.expiresAt == null ? 0 : Math.max(0, session.expiresAt - now);
}
/** An approval, countdown, or stale read cannot itself grant access. */
export function accessGate(
  session: SessionView | null,
  now: number,
  stale = false,
) {
  return (
    !stale && session?.state === "ACTIVE" && secondsRemaining(session, now) > 0
  );
}
export function heartbeatAge(at: number | null, now: number) {
  if (at === null) return "Not received";
  const seconds = Math.max(0, now - at);
  return seconds < 60
    ? `${seconds}s ago`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
}
export function hashscanUrl(tx: string) {
  return `https://hashscan.io/testnet/transaction/${encodeURIComponent(tx)}`;
}
