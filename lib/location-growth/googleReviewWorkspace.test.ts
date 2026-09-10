import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/admin/location-growth/google-discovery-review/route.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "app/admin/dashboard/settings/location-tools/google-discovery/page.tsx"), "utf8");
const client = fs.readFileSync(path.join(root, "components/admin/location-tools/GoogleDiscoveryReviewList.tsx"), "utf8");

describe("Google review decision workspace", () => {
  it("keeps all review mutations behind admin API authorization", () => {
    expect(route).toContain("requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth)");
  });

  it("supports publish, hide, reject, re-evaluate, and category correction actions", () => {
    for (const action of ["approve_publish", "keep_hidden", "reject", "re_evaluate", "correct_category"]) {
      expect(route).toContain(`\"${action}\"`);
    }
    expect(route).toContain("evaluateGoogleDiscoveryCandidate");
    expect(route).toContain("gap: { ...gap, category: newCategory }");
  });

  it("loads enough candidates for the full current review queue", () => {
    expect(page).toContain(".limit(500)");
    expect(page).toContain("Google review decision workspace");
  });

  it("offers reason filters and batch actions in the client", () => {
    expect(client).toContain("All review reasons");
    expect(client).toContain("Select visible");
    expect(client).toContain("Approve & publish");
    expect(client).toContain("Save category & re-evaluate");
  });
});
