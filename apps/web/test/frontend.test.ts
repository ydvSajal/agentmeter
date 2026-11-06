import { describe, expect, it, vi } from "vitest";
import {
  AgentView,
  AuditRow,
  DeviceView,
  SessionView,
  SessionState,
} from "@agentmeter/shared/src/schemas";
import { createGatewayClient } from "@agentmeter/shared/src/api-client";
import {
  accessGate,
  budgetUsage,
  heartbeatAge,
  money,
} from "../src/lib/format";
import { fixtures } from "../src/lib/fixtures";
import { readDashboard } from "../src/lib/gateway";
import { handleWorldCallback } from "../src/lib/world-callback";
import { isFixtureMode } from "../src/lib/config";
const sample = fixtures(1800000000);

describe("wire-compatible fixtures", () => {
  it("validates every row and session through the shared runtime contracts", () => {
    sample.devices.forEach((row) =>
      expect(DeviceView.safeParse(row).success).toBe(true),
    );
    sample.agents.forEach((row) =>
      expect(AgentView.safeParse(row).success).toBe(true),
    );
    sample.audit.forEach((row) =>
      expect(AuditRow.safeParse(row).success).toBe(true),
    );
    sample.sessions.forEach((row) =>
      expect(SessionView.safeParse(row).success).toBe(true),
    );
    sample.audit.forEach((row) =>
      expect(
        sample.sessions.some(
          (s) => s.id === row.sessionId && s.state === row.state,
        ),
      ).toBe(true),
    );
  });
});
describe("money, budgets and access", () => {
  it("preserves tinybar precision beyond the safe integer range", () => {
    expect(money("9007199254740993", "HBAR")).toBe("90,071,992.54740993 HBAR");
    expect(money("1", "HBAR")).toBe("0.00000001 HBAR");
    expect(money("0", "HBAR")).toBe("0.00 HBAR");
    expect(money("12345", "0.0.7")).toBe("12,345 base units (0.0.7)");
  });
  it("keeps fractional ratios, clamps bars and handles zero caps", () => {
    expect(budgetUsage("35000000", "200000000").percentage).toBe(17.5);
    expect(budgetUsage("150", "100")).toMatchObject({
      percentage: 150,
      bar: 100,
      over: true,
      remaining: "0",
    });
    expect(budgetUsage("0", "0")).toMatchObject({
      percentage: 0,
      bar: 0,
      zeroCap: true,
    });
    expect(budgetUsage("1", "0")).toMatchObject({ bar: 100, over: true });
  });
  it("unlocks only fresh ACTIVE receipts before the exact expiry boundary", () => {
    for (const state of SessionState.options)
      expect(accessGate({ ...sample.session, state }, 1800000001)).toBe(
        state === "ACTIVE",
      );
    expect(accessGate(sample.session, sample.session.expiresAt!)).toBe(false);
    expect(accessGate(sample.session, 1800000001, true)).toBe(false);
    expect(accessGate({ ...sample.session, expiresAt: null }, 1800000001)).toBe(
      false,
    );
    expect(heartbeatAge(null, 100)).toBe("Not received");
    expect(heartbeatAge(110, 100)).toBe("0s ago");
  });
  it("never falls back to fixtures when live mode was explicitly required", () => {
    expect(isFixtureMode({})).toBe(true);
    expect(isFixtureMode({ fixtures: "0" })).toBe(false);
    expect(isFixtureMode({ gateway: "http://localhost:8787" })).toBe(false);
    expect(
      isFixtureMode({ fixtures: "1", gateway: "http://localhost:8787" }),
    ).toBe(true);
  });
});
describe("gateway boundary", () => {
  function client(failed: string[] = []) {
    return createGatewayClient(
      "http://gateway",
      vi.fn(async (input) => {
        const path = new URL(String(input)).pathname;
        if (failed.includes(path))
          return Response.json(
            { error: { code: "INTERNAL", message: "Unavailable" } },
            { status: 503 },
          );
        const body =
          path === "/devices"
            ? sample.devices
            : path === "/agents"
              ? sample.agents
              : path === "/audit"
                ? sample.audit
                : sample.session;
        return Response.json(body);
      }) as typeof fetch,
    );
  }
  it("loads a real session from the audited session ID", async () => {
    const data = await readDashboard(client());
    expect(data.session?.id).toBe(sample.session.id);
    expect(data.issues).toEqual([]);
  });
  it("retains independent last-good blocks while reporting failed reads", async () => {
    const previous = await readDashboard(client());
    const data = await readDashboard(client(["/agents"]), previous);
    expect(data.agents).toEqual(previous.agents);
    expect(data.devices).toEqual(sample.devices);
    expect(data.issues).toEqual(["Agents unavailable"]);
  });
  it("marks an old audit or failed session as unverified", async () => {
    const previous = await readDashboard(client());
    expect(
      (await readDashboard(client(["/audit"]), previous)).sessionStale,
    ).toBe(true);
    const data = await readDashboard(
      client([`/sessions/${sample.session.id}`]),
      previous,
    );
    expect(data.session).toBeNull();
    expect(data.sessionStale).toBe(true);
  });
  it("rejects malformed gateway data instead of presenting it as an empty success", async () => {
    const broken = createGatewayClient("http://gateway", async () =>
      Response.json([{ id: "bad" }]),
    );
    const data = await readDashboard(broken);
    expect(data.issues).toHaveLength(3);
    expect(data.session).toBeNull();
  });
});
describe("World callback is fail closed", () => {
  const config = { fixture: false, gateway: "http://gateway" };
  it.each(["APPROVED", "DENIED", "EXPIRED"])(
    "renders gateway result %s and binds its session",
    async (result) => {
      const fetcher = vi.fn(async () =>
        Response.json({ result, sessionId: "s_bound" }),
      );
      const response = await handleWorldCallback(
        new Request("http://web/api/world/callback?code=one-time&state=bound"),
        config,
        fetcher,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(`/sessions/s_bound`);
      expect(String(fetcher.mock.calls[0]?.[0])).toContain("state=bound");
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );
  it("forwards provider denial with state to let the gateway close the request", async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      expect(String(url)).toContain("error=access_denied");
      return Response.json({ result: "DENIED", sessionId: "s_denied" });
    });
    expect(
      (
        await handleWorldCallback(
          new Request(
            "http://web/api/world/callback?error=access_denied&state=bound",
          ),
          config,
          fetcher as typeof fetch,
        )
      ).status,
    ).toBe(200);
  });
  it("does not contact the gateway without state or in fixture mode", async () => {
    const fetcher = vi.fn();
    expect(
      (
        await handleWorldCallback(
          new Request("http://web/api/world/callback?code=x"),
          config,
          fetcher,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleWorldCallback(
          new Request("http://web/api/world/callback?code=x&state=y"),
          { ...config, fixture: true },
          fetcher,
        )
      ).status,
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { result: "ALLOW", sessionId: "s" },
    { result: "APPROVED" },
    { result: ["APPROVED"], sessionId: "s" },
  ])("rejects malformed callback results", async (body) => {
    const response = await handleWorldCallback(
      new Request("http://web/api/world/callback?code=x&state=y"),
      config,
      async () => Response.json(body),
    );
    expect(response.status).toBe(502);
  });
  it("escapes session content and rejects failed upstream verification", async () => {
    const request = new Request("http://web/api/world/callback?code=x&state=y");
    const response = await handleWorldCallback(request, config, async () =>
      Response.json({
        result: "APPROVED",
        sessionId: "<script>alert(1)</script>",
      }),
    );
    expect(await response.text()).not.toContain("<script>");
    expect(
      (
        await handleWorldCallback(
          request,
          config,
          async () => new Response("down", { status: 500 }),
        )
      ).status,
    ).toBe(502);
  });
});
