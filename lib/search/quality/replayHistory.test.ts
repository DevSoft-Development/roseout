import { describe, expect, it, vi } from "vitest";
import { loadReplayItemsPerRun, replayItemsComplete } from "./replayHistory";

describe("replay history loading", () => {
  it("loads each run independently so the database row cap cannot truncate newer runs", async () => {
    const load = vi.fn(async (runId: string) =>
      Array.from({ length: runId === "new" ? 100 : 75 }, (_, index) => ({ runId, index })),
    );
    const result = await loadReplayItemsPerRun([
      { id: "new", query_count: 100 },
      { id: "old", query_count: 75 },
    ], load);

    expect(load).toHaveBeenCalledTimes(2);
    expect(result.get("new")).toHaveLength(100);
    expect(result.get("old")).toHaveLength(75);
  });

  it("detects incomplete exports instead of presenting partial rows as a complete replay", () => {
    expect(replayItemsComplete({ id: "run", query_count: 100 }, Array(23))).toBe(false);
    expect(replayItemsComplete({ id: "run", query_count: 100 }, Array(100))).toBe(true);
  });
});
