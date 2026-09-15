import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { requiresAdminApiSession } from "../admin-api-boundary-paths";

const ROUTE_AUTH_MARKERS = [
  "requireAdminApiRole(", "requireSuperAdmin(", "requireAdminRole(", "getCurrentAdmin(",
  "requireMarketingAdminApi(", "requireMarketingViewerApi(",
  "CRON_SECRET", "x-internal-import-secret", "x-admin-secret", "authorizeAdminApiBoundary(",
];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function routePath(file: string) {
  const rel = path.relative(path.join(process.cwd(), "app"), file).replaceAll(path.sep, "/");
  return `/${rel}`.replace(/\/route\.ts$/, "").replace(/\[\.\.\.[^\]]+\]/g, "test/test").replace(/\[[^\]]+\]/g, "test-id");
}

function normalizedFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8").toLowerCase().replace(/\s+/g, " ");
}

describe("admin service-role boundary", () => {
  it("requires every service-role admin route to have route auth or the central session boundary", () => {
    const root = path.join(process.cwd(), "app", "api", "admin");
    const failures: string[] = [];
    for (const file of walk(root).filter((value) => value.endsWith("/route.ts"))) {
      const source = fs.readFileSync(file, "utf8");
      if (!source.includes("supabaseAdmin")) continue;
      const hasOwnAuth = ROUTE_AUTH_MARKERS.some((marker) => source.includes(marker));
      if (!hasOwnAuth && !requiresAdminApiSession(routePath(file))) failures.push(path.relative(process.cwd(), file));
    }
    expect(failures, `unguarded service-role admin routes: ${failures.join(", ")}`).toEqual([]);
  });

  it("keeps privileged SECURITY DEFINER RPCs off the public Data API", () => {
    const migration = normalizedFile("supabase/migrations/20260907222000_harden_public_security_definer_rpcs.sql");
    for (const rpc of [
      "enqueue_nightly_location_search_profile_run",
      "enterprise_search_profile_locations",
      "book_large_group_live",
      "track_location_analytics_event",
    ]) {
      expect(migration).toContain(`public.${rpc}`);
    }
    expect(migration.match(/from public, anon, authenticated/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration.match(/to service_role/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps high-value PII tables server-only unless an explicit RLS client path exists", () => {
    const migration = normalizedFile("supabase/migrations/20260907222500_harden_pii_table_grants.sql");
    for (const table of [
      "location_reservations",
      "reservations",
      "support_tickets",
      "support_ticket_messages",
      "event_ticket_orders",
      "event_tickets",
      "experience_bookings",
      "career_application_files",
    ]) {
      expect(migration).toContain(`revoke all privileges on table public.${table} from public, anon, authenticated`);
      expect(migration).toContain(`grant all privileges on table public.${table} to service_role`);
    }
    expect(migration).toContain("grant select, update on table public.career_applications to authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.crm_contacts to authenticated");
  });

  it("rate limits the private resume storage write path before parsing the upload body", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/api/careers/upload-resume/route.ts"), "utf8");
    const rateLimitIndex = source.indexOf("await enforceRateLimit(");
    const formDataIndex = source.indexOf("await req.formData()");
    expect(rateLimitIndex).toBeGreaterThan(-1);
    expect(formDataIndex).toBeGreaterThan(rateLimitIndex);
  });

  it("never treats a client-writable impersonation cookie as an authenticated user id", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "lib/getCurrentUserId.ts"), "utf8");
    expect(source).not.toContain("theouthaven_impersonate_user_id");
    expect(source).toContain("supabase.auth.getUser()");
  });
});
