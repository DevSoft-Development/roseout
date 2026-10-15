import { describe, expect, it } from "vitest";
import { acquisitionReservationInput } from "../acquisition-reservation";

describe("LI V2 acquisition reservation fail closed", () => {
  const base = { provider: "dataforseo", capability: "discovery", eventKey: "pilot-run-001:target-05", maximumUsd: "0.025" };
  it("uses repeatable keys across retries", () => {
    expect(acquisitionReservationInput(base)).toEqual(acquisitionReservationInput(base));
    expect(acquisitionReservationInput(base).p_event_key).toBe("pilot-run-001:target-05:dataforseo");
  });
  it("separates provider reservations", () => {
    expect(acquisitionReservationInput(base).p_event_key).not.toBe(
      acquisitionReservationInput({ ...base, provider: "brave" }).p_event_key);
  });
  it.each([undefined, null, "", "0", "-0.01", "NaN", "Infinity", "x"])("rejects unsafe price %s", (maximumUsd) => {
    expect(() => acquisitionReservationInput({ ...base, maximumUsd })).toThrow("acquisition_provider_price_unconfigured");
  });
  it.each(["", "short", "../bad", "bad key with spaces"])("rejects unstable key %s", (eventKey) => {
    expect(() => acquisitionReservationInput({ ...base, eventKey })).toThrow("acquisition_stable_event_key_required");
  });
});
