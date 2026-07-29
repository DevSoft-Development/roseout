import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveSearchProfileRollout } from "../retrieval/searchProfileMode";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Search Profile rollout admin controls", () => {
  it("mounts persisted rollout controls on the admin settings page", () => {
    const page = read("app/admin/dashboard/settings/page.tsx");
    expect(page).toContain("SearchProfileRolloutClient");
    expect(page).toContain("getEffectiveSearchProfileRolloutConfig");
  });

  it("exposes a protected update API and audit-backed config service", () => {
    const route = read("app/api/admin/settings/search-profile-rollout/route.ts");
    const config = read("lib/search/v2/retrieval/searchProfileRolloutConfig.ts");
    expect(route).toContain("requireAdminApiRole");
    expect(route).toContain("updateSearchProfileRolloutConfig");
    expect(config).toContain("search_profile_rollout.updated");
    expect(config).toContain("revalidateTag");
  });

  it("forces off while the emergency kill switch is active", () => {
    const rollout = resolveSearchProfileRollout("request-1", {
      mode: "primary",
      canaryPercent: 100,
      killSwitch: true,
    });
    expect(rollout.configuredMode).toBe("primary");
    expect(rollout.mode).toBe("off");
    expect(rollout.serveProfiles).toBe(false);
  });
});
