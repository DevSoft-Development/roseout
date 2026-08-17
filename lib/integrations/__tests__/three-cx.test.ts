import { describe, expect, it } from "vitest";
import {
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

  it("splits a display name without losing multi-word first names", () => {
    expect(splitContactName("The Out Haven Lounge")).toEqual({
      firstName: "The Out Haven",
      lastName: "Lounge",
    });
  });
});
