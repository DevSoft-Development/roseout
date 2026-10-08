import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminFoundation = readFileSync(
  "apps/admin/app/admin/dashboard/admin-enterprise-foundation.css",
  "utf8",
);
const businessFoundation = readFileSync(
  "apps/business/app/business-enterprise-foundation.css",
  "utf8",
);

describe("enterprise dashboard foundation", () => {
  it("shares the same brand, spacing, radius, shadow, and typography contract", () => {
    for (const css of [adminFoundation, businessFoundation]) {
      for (const token of [
        "--toh-brand: #e1062a",
        "--toh-space-4: 16px",
        "--toh-radius-lg: 12px",
        "--toh-shadow-sm:",
        "--toh-control-height: 38px",
        "--toh-font-sans:",
      ]) {
        expect(css).toContain(token);
      }
    }
  });

  it("keeps light and dark surfaces semantic", () => {
    expect(adminFoundation).toContain("--toh-surface-card: var(--admin-shell-card)");
    expect(businessFoundation).toContain("--toh-surface-card: var(--business-panel)");
  });
});
