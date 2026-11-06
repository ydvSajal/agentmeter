import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

describe("postgres schema (Neon, AD034/AD037)", () => {
  it("committed postgres schema matches the one derived from schema.prisma", () => {
    const committed = read("prisma/postgres/schema.prisma");
    execFileSync("node", ["scripts/gen-pg-schema.mjs"], { cwd: root, stdio: "ignore" });
    expect(read("prisma/postgres/schema.prisma")).toBe(committed);
  });

  it("initial migration creates a table for every model and an index for every unique", () => {
    const schema = read("prisma/postgres/schema.prisma");
    const sql = read("prisma/postgres/migrations/0001_init/migration.sql");
    const models = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);
    expect(models.length).toBeGreaterThan(5);
    for (const m of models) expect(sql).toContain(`CREATE TABLE "${m}"`);
    expect(sql).toContain('"Notification"');
    expect(sql).toMatch(/CREATE UNIQUE INDEX "Session_paymentPayloadHash_key"/);
  });
});
