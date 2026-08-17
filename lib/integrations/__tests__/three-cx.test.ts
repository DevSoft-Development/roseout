import { describe, expect, it } from "vitest";
import {
  buildThreeCxWebClientCallUrl,
  normalizePhone,
  phoneLookupSuffix,
  splitContactName,
} from "@/lib/integrations/three-cx";

describe("3CX CRM helpers", () => {
  it("normalizes US phone formats to ten digits", () => {
    expect(normalizePhone("+1 (516) 200-0701")).toBe("5162000701");
    expect(normalizePhone("516-200-0701")).toBe("5162000701");
  });

  it("uses the final four digits for candidate lookup", () => {
    expect(phoneLookupSuffix("+1 (516) 200-0701")).toBe("0701");
  });

  it("builds a direct 3CX web client call URL", () => {
    expect(
      buildThreeCxWebClientCallUrl(
        "https://pbx.example.com",
        "+1 (516) 200-0701",
      ),
    ).toBe("https://pbx.example.com/webclient/#/call?phone=5162000701");
    expect(
      buildThreeCxWebClientCallUrl(
        "https://pbx.example.com/webclient/",
        "516-200-0701",
      ),
    ).toBe("https://pbx.example.com/webclient/#/call?phone=5162000701");
  });

  it("accepts a bare 3CX hostname and defaults it to HTTPS", () => {
    expect(
      buildThreeCxWebClientCallUrl(
        "theouthaven.ny.3cx.us",
        "2127446397",
      ),
    ).toBe("https://theouthaven.ny.3cx.us/webclient/#/call?phone=2127446397");
  });

  it("does not build a call URL without usable 3CX config", () => {
    expect(buildThreeCxWebClientCallUrl("", "516-200-0701")).toBeNull();
    expect(buildThreeCxWebClientCallUrl("https://", "516-200-0701")).toBeNull();
  });

  it("splits a display name without losing multi-word first names", () => {
    expect(splitContactName("The Out Haven Lounge")).toEqual({
      firstName: "The Out Haven",
      lastName: "Lounge",
    });
  });
});
