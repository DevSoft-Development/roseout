import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Schedule = {
  name: string;
  expression: string;
  function: string;
  body?: Record<string, unknown>;
};

const schedules = JSON.parse(
  readFileSync("infra/aws/edge-runtime/schedules.json", "utf8"),
) as Schedule[];

function schedule(name: string) {
  const row = schedules.find((candidate) => candidate.name === name);
  if (!row) throw new Error(`Missing AWS schedule: ${name}`);
  return row;
}

describe("Location Intelligence enrichment worker consolidation", () => {
  it("preserves the canonical 65-schedule manifest", () => {
    expect(schedules).toHaveLength(65);
    expect(new Set(schedules.map((row) => row.name)).size).toBe(65);
  });

  it("routes the legacy Google enrichment wake to the canonical catalog runner", () => {
    const legacyWake = schedule("google-location-enrichment");
    expect(legacyWake.expression).toBe("cron(20 7 * * ? *)");
    expect(legacyWake.function).toBe("sqs:background-cron");
    expect(legacyWake.body).toEqual({
      target: "/api/cron/managed?job=catalog-enrichment-runner",
    });
  });

  it("keeps recovery workers and canonical catalog scheduling intact", () => {
    expect(schedule("catalog-enrichment-runner").body).toEqual({
      target: "/api/cron/managed?job=catalog-enrichment-runner",
    });
    expect(schedule("nightly-photo-backfill").expression).toBe("cron(30 6 * * ? *)");
    expect(schedule("unified-location-gap-repair").expression).toBe("cron(0/15 * * * ? *)");
    expect(schedule("worker-dispatcher-unified").expression).toBe("cron(0/15 * * * ? *)");
  });
});
