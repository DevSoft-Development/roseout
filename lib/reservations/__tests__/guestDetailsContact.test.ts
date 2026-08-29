import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/reserve/ReserveGuestDetails.tsx", "utf8");

describe("ReserveGuestDetails contact editing", () => {
  it("renders Edit guest and posts phone email and notes to the update API", () => {
    expect(source).toContain("Edit guest");
    expect(source).toContain("submitEditContact");
    expect(source).toContain('customer_phone: String(form.get("phone") || "").trim()');
    expect(source).toContain('customer_email: String(form.get("email") || "").trim()');
    expect(source).toContain('notes: String(form.get("notes") || "").trim()');
    expect(source).toContain("Save guest details");
  });
});
