import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("consumer personalization privacy contract", () => {
  it("stores a user-controlled personalization preference and excludes opt-outs from vector backfills", () => {
    const migration = read("supabase/migrations/20260921234500_add_consumer_personalization_preferences.sql");
    expect(migration).toContain("personalization_enabled boolean not null default true");
    expect(migration).toContain("coalesce(cp.personalization_enabled,true)=true");
  });

  it("gates both historical and active V2 personalization on consent", () => {
    const loader = read("lib/search/enterprise/personalizationProfileLoader.ts");
    const v2 = read("lib/search/v2/scoring/applyHfPersonalization.ts");
    expect(loader).toContain("personalizationAllowedForUser");
    expect(loader).toContain("if (!allowed) return buildUserPreferenceProfile");
    expect(v2).toContain("personalizationAllowedForUser");
    expect(v2).toContain("personalization_opted_out");
  });

  it("exposes controls on web and mobile", () => {
    const web = read("components/user/PrivacyPreferencesClient.tsx");
    const mobile = read("mobile/app/(tabs)/profile.tsx");
    expect(web).toContain('role="switch"');
    expect(web).toContain("/api/user/privacy-preferences");
    expect(mobile).toContain("Personalized recommendations");
    expect(mobile).toContain('method: "PATCH"');
    const api = read("app/api/user/privacy-preferences/route.ts");
    const mobileApi = read("app/api/mobile/v1/me/route.ts");
    const worker = read("app/api/cron/search-ml-learning-maintenance/route.ts");
    expect(api).toContain('from("user_search_preference_vectors")');
    expect(api).toContain(".delete()");
    expect(mobileApi).toContain('from("user_search_preference_vectors")');
    expect(mobileApi).toContain(".delete()");
    expect(worker).toContain('select("personalization_enabled")');
    expect(worker).toContain("personalization_enabled === false");
  });
});
