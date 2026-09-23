import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Admin AI & Trust operations", () => {
  it("keeps the trust dashboard in isolated Admin with protected access", () => {
    const page = read("apps/admin/app/admin/dashboard/ai-trust/page.tsx");
    expect(page).toContain('requireAdminRole(["superadmin", "admin", "manager", "viewer"])');
    expect(page).toContain("Search Health");
    expect(page).toContain("Verified-visit reviews");
    expect(page).toContain("Sponsored disclosure");
    expect(page).toContain("Trust incident ledger");
    expect(page).toContain('admin.role === "superadmin" || admin.role === "admin"');
    expect(page).toContain("Incident status unavailable");
    expect(page).toContain("incidentHistoryUnavailable");
    expect(page).toContain('canAdmin(admin.role, "searchHealth")');
    expect(page).toContain('canAdmin(admin.role, "reviews")');
    expect(page).toContain('canAdmin(admin.role, "marketing")');
    expect(page).toContain('canAdmin(admin.role, "security")');
    expect(page).toContain('name="provider"');
    expect(page).toContain('name="model"');
    expect(page).toContain('getAdminDatabaseClient');
    expect(page).not.toContain("@/lib/supabase-admin");
    expect(page).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(page).not.toContain("OPENAI_API_KEY}");
  });

  it("adds the protected navigation entry and incident schema", () => {
    const nav = read("apps/admin/app/admin/dashboard/admin-navigation.ts");
    const migration = read("supabase/migrations/20260922095000_add_ai_trust_incidents.sql");
    expect(nav).toContain('href: "/admin/dashboard/ai-trust"');
    expect(migration).toContain("create table if not exists public.ai_trust_incidents");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.ai_trust_incidents from public, anon, authenticated");
  });
});
