import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Trust Operations contract", () => {
  it("keeps the incident ledger protected from public roles", () => {
    const migration = read("supabase/migrations/20260922091500_trust_incidents.sql");
    expect(migration).toContain("alter table public.trust_incidents enable row level security");
    expect(migration).toContain("revoke all on table public.trust_incidents from public, anon, authenticated");
    expect(migration).toContain("grant all on table public.trust_incidents to service_role");
  });

  it("keeps verified visits and trust incidents visible to admins", () => {
    const loader = read("apps/admin/lib/trust-operations.ts");
    expect(loader).toContain('.eq("verified_visit", true)');
    expect(loader).toContain('.from("trust_incidents")');
    const page = read("apps/admin/app/admin/dashboard/trust/page.tsx");
    expect(page).toContain("Verified visit reviews");
    expect(page).toContain("Recommendation audit");
    expect(page).toContain("Sponsored disclosure");
    expect(page).toContain("Record a trust incident");
  });
});
