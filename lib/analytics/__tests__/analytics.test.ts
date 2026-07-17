import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeEventName } from "../events";
import { createDedupeKey, createPairId, createQueryFingerprint } from "../identity";
import { getAnalyticsIdentity } from "../trackClientEvent";
import { buildAnalyticsFeedbackEvent, FEEDBACK_WEIGHTS } from "../../ml/buildAnalyticsFeedbackEvent";

describe("analytics normalization", () => {
  it("maps aliases and rejects unknown names", () => {
    expect(normalizeEventName("favorite-added")?.canonical).toBe("location_saved");
    expect(normalizeEventName("not_a_real_event")).toBeNull();
  });
  it("assigns explicit ML signals without treating operations as positive", () => {
    expect(FEEDBACK_WEIGHTS.location_saved).toBeGreaterThan(FEEDBACK_WEIGHTS.location_clicked!);
    expect(buildAnalyticsFeedbackEvent({ event_name: "search_completed" })?.feedback_polarity).toBeNull();
    expect(buildAnalyticsFeedbackEvent({ event_name: "result_hidden" })?.feedback_polarity).toBe("negative");
  });
  it("creates stable query, pair, and dedupe identities", () => {
    expect(createQueryFingerprint({ normalized_query: " Dinner   NYC ", market: "nyc" })).toBe(createQueryFingerprint({ market: "nyc", normalized_query: "dinner nyc" }));
    expect(createQueryFingerprint({ normalized_query: "dinner" })).not.toBe(createQueryFingerprint({ normalized_query: "lunch" }));
    expect(createPairId("r1", "a1", { market: "nyc" })).toBe(createPairId("r1", "a1", { market: "nyc" }));
    const base = { event_name: "location_clicked", search_id: "s1", location_id: "l1", session_id: "x", action_id: "a" };
    expect(createDedupeKey(base)).toBe(createDedupeKey(base));
    expect(createDedupeKey(base)).not.toBe(createDedupeKey({ ...base, search_id: "s2" }));
    expect(createDedupeKey(base)).not.toBe(createDedupeKey({ ...base, location_id: "l2" }));
  });
});

describe("browser identity", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("does not touch browser APIs during SSR", () => expect(getAnalyticsIdentity()).toEqual({ anonymous_id: null, session_id: null }));
  it("persists anonymous and session IDs", () => {
    const makeStorage = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) } as unknown as Storage; };
    vi.stubGlobal("window", { localStorage: makeStorage(), sessionStorage: makeStorage() });
    expect(getAnalyticsIdentity()).toEqual(getAnalyticsIdentity());
  });
  it("survives storage failures", () => {
    const bad = { getItem: () => { throw new Error("disabled"); }, setItem: () => {} } as unknown as Storage;
    vi.stubGlobal("window", { localStorage: bad, sessionStorage: bad });
    expect(getAnalyticsIdentity()).toEqual({ anonymous_id: null, session_id: null });
  });
});
