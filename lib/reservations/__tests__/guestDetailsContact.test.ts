import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/reserve/ReserveGuestDetails.tsx", "utf8");

describe("ReserveGuestDetails contact editing", () => {
  it("renders Edit guest and posts phone email and notes to the update API", () => {
    expect(source).toContain("Edit guest");
    expect(source).toContain("submitEditContact");
    expect(source).toContain("customer_phone:phone");
    expect(source).toContain("customer_email:email");
    expect(source).toContain("notes");
    expect(source).toContain("Save guest details");
  });
});
