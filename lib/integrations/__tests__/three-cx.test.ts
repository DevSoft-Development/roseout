import { describe, expect, it } from "vitest";
import {
  normalizePhone,
  normalizePhoneForDial,
  phoneLookupSuffix,
  splitContactName,
} from "@/lib/integrations/three-cx";

describe("3CX CRM helpers", () => {
  it("normalizes US phone formats to ten digits", () => {
    expect(normalizePhone("+1 (516) 200-0701")).toBe("5162000701");
    expect(normalizePhone("516-200-0701")).toBe("5162000701");
  });

  it("formats NANP phone numbers for dialing with a +1 country code", () => {
    expect(normalizePhoneForDial("516-200-0701")).toBe("+15162000701");
    expect(normalizePhoneForDial("1 (516) 200-0701")).toBe("+15162000701");
    expect(normalizePhoneForDial("+1 (516) 200-0701")).toBe("+15162000701");
  });

  it("preserves international numbers that already include a country code", () => {
    expect(normalizePhoneForDial("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("uses the final four digits for candidate lookup", () => {
    expect(phoneLookupSuffix("+1 (516) 200-0701")).toBe("0701");
  });

  it("splits a display name without losing multi-word first names", () => {
    expect(splitContactName("The Out Haven Lounge")).toEqual({
      firstName: "The Out Haven",
      lastName: "Lounge",
    });
  });
});
