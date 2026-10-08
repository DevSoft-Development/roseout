import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEARCH_V3_CONTROLS,
  SEARCH_V3_LANES,
  validateSearchV3Controls,
  readSearchV3RuntimeControls,
  invalidateSearchV3RuntimeControlsCache,
  wrapSearchV3RetrievalProviders,
  resetLocalSearchV3Breakers,
} from "../controls/searchV3Controls";

describe("Search V3 six-lane operations", () => {
  it("registers five mandatory lanes and optional review intelligence", () => {
    expect(SEARCH_V3_LANES).toHaveLength(6);
    expect(SEARCH_V3_LANES.filter((lane) => lane.core)).toHaveLength(5);
    expect(SEARCH_V3_LANES.find((lane) => lane.id === "review_intelligence")?.core).toBe(false);
  });

  it("defaults to shadow and always retains V2 fallback", () => {
    expect(DEFAULT_SEARCH_V3_CONTROLS.mode).toBe("shadow");
    expect(DEFAULT_SEARCH_V3_CONTROLS.v2Fallback).toBe(true);
    expect(DEFAULT_SEARCH_V3_CONTROLS.canaryPercent).toBe(0);
  });

  it("blocks disabling V2 fallback", () => {
    expect(() => validateSearchV3Controls({
      ...DEFAULT_SEARCH_V3_CONTROLS,
      v2Fallback: false,
    })).toThrow(/V2 fallback/);
  });

  it("fails closed to shadow if shared settings are unavailable", async () => {
    invalidateSearchV3RuntimeControlsCache();
    const db = { from: () => ({
      select: () => ({ eq: () => ({
        maybeSingle: async () => { throw new Error("database unavailable"); },
      }) }),
    }) };
    const controls = await readSearchV3RuntimeControls(db);
    expect(controls.mode).toBe("shadow");
    expect(controls.v2Fallback).toBe(true);
  });

  it("opens after the configured failure threshold and blocks subsequent requests", async () => {
    resetLocalSearchV3Breakers();
    const provider = {
      providerId: SEARCH_V3_LANES[0].providerId,
      retrieve: async () => { throw new Error("upstream unavailable"); },
    } as any;
    const controls = {
      ...DEFAULT_SEARCH_V3_CONTROLS,
      lanes: {
        ...DEFAULT_SEARCH_V3_CONTROLS.lanes,
        structured: { enabled: true, forceOpen: false, threshold: 1, cooldownMs: 60000 },
      },
    };
    const wrapped = wrapSearchV3RetrievalProviders([provider], async () => controls);
    await expect(wrapped[0].retrieve({} as any)).rejects.toThrow("upstream unavailable");
    await expect(wrapped[0].retrieve({} as any)).rejects.toThrow("v3_lane_circuit_open:structured");
  });

  it("rejects incomplete lane configuration", () => {
    expect(() => validateSearchV3Controls({
      ...DEFAULT_SEARCH_V3_CONTROLS,
      lanes: { ...DEFAULT_SEARCH_V3_CONTROLS.lanes, menu_semantic: undefined } as any,
    })).toThrow(/Missing lane/);
  });
});
