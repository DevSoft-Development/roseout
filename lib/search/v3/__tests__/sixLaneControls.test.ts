import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEARCH_V3_CONTROLS,
  SEARCH_V3_LANES,
  validateSearchV3Controls,
  readSearchV3RuntimeControls,
  invalidateSearchV3RuntimeControlsCache,
  wrapSearchV3SharedRetrievalProviders,
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

  it("rejects a remote open circuit before calling its provider", async () => {
    let invoked = false;
    const provider = {
      providerId: SEARCH_V3_LANES[0].providerId,
      retrieve: async () => { invoked = true; throw new Error("should not run"); },
    } as any;
    const db = { rpc: async () => ({ data: null, error: null }) };
    const wrapped = wrapSearchV3SharedRetrievalProviders(
      [provider], db, async () => DEFAULT_SEARCH_V3_CONTROLS,
    );
    await expect(wrapped[0].retrieve({} as any)).rejects.toThrow("v3_lane_circuit_open:structured");
    expect(invoked).toBe(false);
  });

  it("fails closed when the shared breaker RPC is unavailable", async () => {
    const provider = {providerId: SEARCH_V3_LANES[0].providerId, retrieve: async () => ({})} as any;
    const db = {rpc: async () => ({data:null,error:{message:"network unavailable"}})};
    const wrapped = wrapSearchV3SharedRetrievalProviders(
      [provider], db, async () => DEFAULT_SEARCH_V3_CONTROLS,
    );
    await expect(wrapped[0].retrieve({} as any)).rejects.toThrow("v3_lane_breaker_unavailable:structured");
  });

  it("rejects incomplete lane configuration", () => {
    expect(() => validateSearchV3Controls({
      ...DEFAULT_SEARCH_V3_CONTROLS,
      lanes: { ...DEFAULT_SEARCH_V3_CONTROLS.lanes, menu_semantic: undefined } as any,
    })).toThrow(/Missing lane/);
  });
});
