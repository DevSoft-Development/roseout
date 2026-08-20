import { describe, expect, it } from "vitest";
import { calculateEventFees } from "./event-fees";

describe("calculateEventFees", () => {
  it("grosses up customer-paid fees so a $100 ticket preserves organizer ticket value", () => {
    const result = calculateEventFees(10_000, "customer");
    expect(result.platformFeeCents).toBe(500);
    expect(result.customerServiceFeeCents).toBe(844);
    expect(result.customerTotalCents).toBe(10_844);
    expect(result.stripeProcessingEstimateCents).toBe(344);
    expect(result.organizerNetEstimateCents).toBe(10_000);
  });

  it("deducts the full fee burden when the organizer pays", () => {
    const result = calculateEventFees(10_000, "organizer");
    expect(result.customerServiceFeeCents).toBe(0);
    expect(result.customerTotalCents).toBe(10_000);
    expect(result.platformFeeCents).toBe(500);
    expect(result.stripeProcessingEstimateCents).toBe(320);
    expect(result.organizerNetEstimateCents).toBe(9_180);
  });

  it("splits the combined fee burden approximately equally", () => {
    const result = calculateEventFees(10_000, "split");
    expect(result.customerServiceFeeCents).toBe(416);
    expect(result.customerTotalCents).toBe(10_416);
    expect(result.stripeProcessingEstimateCents).toBe(332);
    expect(result.organizerFeeCents).toBe(416);
    expect(result.organizerNetEstimateCents).toBe(9_584);
  });
});
