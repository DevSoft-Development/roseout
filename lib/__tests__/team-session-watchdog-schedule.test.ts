import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Schedule = {
  name: string;
  expression: string;
  function: string;
  body: Record<string, unknown>;
};

const schedules = JSON.parse(
  readFileSync("infra/aws/edge-runtime/schedules.json", "utf8"),
) as Schedule[];

const watchdogSource = readFileSync(
  "supabase/functions/team-session-watchdog/index.ts",
  "utf8",
);

describe("team session watchdog schedule", () => {
  it("keeps the canonical fleet at 65 schedules and runs the watchdog hourly", () => {
    expect(schedules).toHaveLength(65);
    expect(schedules.find((entry) => entry.name === "team-session-watchdog")).toMatchObject({
      expression: "cron(0 * * * ? *)",
      function: "team-session-watchdog",
      body: { source: "cron" },
    });
  });

  it("preserves the 12-hour stale-session threshold", () => {
    expect(watchdogSource).toContain("Date.now() - 12 * 60 * 60 * 1000");
    expect(watchdogSource).toContain('status: "needs_correction"');
    expect(watchdogSource).toContain('approval_status: "needs_correction"');
  });
});
