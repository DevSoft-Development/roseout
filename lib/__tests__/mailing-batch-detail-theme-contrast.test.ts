import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/admin/dashboard/operations/mailing-batches/[id]/page.tsx", "utf8");
const routeFixes = readFileSync("app/admin/admin-appearance-route-fixes.css", "utf8");

describe("mailing batch detail light-mode contrast", () => {
  it("scopes the detail workspace for route-specific appearance fixes", () => {
    expect(page).toContain("mailing-batch-detail");
  });

  it("darkens semantic status text in light mode", () => {
    expect(routeFixes).toContain('.admin-theme[data-admin-theme="light"] .mailing-batch-detail [class*="text-emerald-50"]');
    expect(routeFixes).toContain('.admin-theme[data-admin-theme="light"] .mailing-batch-detail [class*="text-amber-50"]');
    expect(routeFixes).toContain('.admin-theme[data-admin-theme="light"] .mailing-batch-detail [class*="text-rose-50"]');
    expect(routeFixes).toContain("#166534");
    expect(routeFixes).toContain("#92400e");
    expect(routeFixes).toContain("#9f1239");
  });

  it("keeps muted copy readable in light mode", () => {
    expect(routeFixes).toContain('.mailing-batch-detail [class*="text-white/"]');
    expect(routeFixes).toContain("color: var(--admin-muted) !important");
  });
});
