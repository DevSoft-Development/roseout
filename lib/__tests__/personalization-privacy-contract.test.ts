import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("consumer personalization privacy contract", () => {
  it("stores a user-controlled personalization preference", () => {
    const migration = read("supabase/migrations/20260921234500_add_consumer_personalization_preferences.sql");
    expect(migration).toContain("personalization_enabled boolean not null default true");
  });

  it("gates historical evidence before personalization is built", () => {
    const loader = read("lib/search/enterprise/personalizationProfileLoader.ts");
    expect(loader).toContain("personalizationAllowedForUser");
    expect(loader).toContain("if (!allowed) return buildUserPreferenceProfile");
  });

  it("exposes controls on web and mobile", () => {
    const web = read("components/user/PrivacyPreferencesClient.tsx");
    const mobile = read("mobile/app/(tabs)/profile.tsx");
    expect(web).toContain('role="switch"');
    expect(web).toContain("/api/user/privacy-preferences");
    expect(mobile).toContain("Personalized recommendations");
    expect(mobile).toContain('method: "PATCH"');
  });
});
