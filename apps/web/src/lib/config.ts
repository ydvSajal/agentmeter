export function isFixtureMode(env: { fixtures?: string; gateway?: string }) {
  return env.fixtures === "1" || (!env.gateway && env.fixtures !== "0");
}
export const fixtureMode = isFixtureMode({
  fixtures: process.env.NEXT_PUBLIC_FIXTURES,
  gateway: process.env.NEXT_PUBLIC_GATEWAY_URL,
});
export const gatewayUrl = (
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8787"
).replace(/\/$/, "");
