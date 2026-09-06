import { describe, expect, it } from "vitest";
import { canonicalizeNaturalSmsContinuation, interpretSmsDecision, parseSmsSelection } from "@/lib/communications/sms-natural-response";

describe("sms natural responses", () => {
  it("understands reservation cancellation confirmations and declines", () => {
    expect(interpretSmsDecision("yeah go ahead and cancel it", "reservation_cancel")).toBe(true);
    expect(interpretSmsDecision("please cancel my reservation", "reservation_cancel")).toBe(true);
    expect(interpretSmsDecision("don't cancel it, keep my reservation", "reservation_cancel")).toBe(false);
  });

  it("understands reservation change confirmations", () => {
    expect(interpretSmsDecision("that works for me", "reservation_change")).toBe(true);
    expect(interpretSmsDecision("go with that new time", "reservation_change")).toBe(true);
    expect(interpretSmsDecision("keep my original time", "reservation_change")).toBe(false);
  });

  it("understands booking and attendance language", () => {
    expect(interpretSmsDecision("we got it booked", "booking")).toBe(true);
    expect(interpretSmsDecision("I wasn't able to book it", "booking")).toBe(false);
    expect(interpretSmsDecision("we ended up going", "attendance")).toBe(true);
    expect(interpretSmsDecision("we couldn't make it", "attendance")).toBe(false);
  });

  it("understands ordinal reservation selections", () => {
    expect(parseSmsSelection("the first one", 3)).toBe(0);
    expect(parseSmsSelection("second reservation", 3)).toBe(1);
    expect(parseSmsSelection("3", 3)).toBe(2);
    expect(parseSmsSelection("the fifth one", 3)).toBeNull();
  });

  it("canonicalizes only safe short continuations", () => {
    expect(canonicalizeNaturalSmsContinuation("yeah, sounds good")).toBe("YES");
    expect(canonicalizeNaturalSmsContinuation("never mind")).toBe("NO");
    expect(canonicalizeNaturalSmsContinuation("move it to 8:30 PM")).toBe("move it to 8:30 PM");
  });
});
