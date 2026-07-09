import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type BannedReference = {
  value: string;
  suggestion: string;
};

const sourceRoots = ["app", "components", "lib"];
const extensions = new Set([".ts", ".tsx"]);

const bannedReferences: BannedReference[] = [
  { value: '"/admin/dashboard/business-crm', suggestion: "Use ROUTES.adminCrm / ROUTES.adminCrmLocation." },
  { value: "'/admin/dashboard/business-crm", suggestion: "Use ROUTES.adminCrm / ROUTES.adminCrmLocation." },
  { value: '"/admin/dashboard/my-workspace/crm', suggestion: "Use ROUTES.adminCrm / ROUTES.adminCrmLocation." },
  { value: "'/admin/dashboard/my-workspace/crm", suggestion: "Use ROUTES.adminCrm / ROUTES.adminCrmLocation." },
  { value: '"/my-workspace/crm', suggestion: "Use ROUTES.adminCrm / ROUTES.adminCrmLocation." },
  { value: "'/my-workspace/crm", suggestion: "Use ROUTES.adminCrm / ROUTES.adminCrmLocation." },
  { value: '"/admin/dashboard/reservation', suggestion: "Use ROUTES.adminReservations." },
  { value: "'/admin/dashboard/reservation", suggestion: "Use ROUTES.adminReservations." },
  { value: '"/reserve/portal', suggestion: "Use ROUTES.reserveDashboard or ROUTES.reserveDashboardReservations." },
  { value: "'/reserve/portal", suggestion: "Use ROUTES.reserveDashboard or ROUTES.reserveDashboardReservations." },
  { value: '"/dashboard/reservations', suggestion: "Use ROUTES.adminReservations." },
  { value: "'/dashboard/reservations", suggestion: "Use ROUTES.adminReservations." },
  { value: '"/business/dashboard/reservations', suggestion: "Use ROUTES.reserveDashboardReservations." },
  { value: "'/business/dashboard/reservations", suggestion: "Use ROUTES.reserveDashboardReservations." },
  { value: '"/admin/claims', suggestion: "Use ROUTES.adminClaims." },
  { value: "'/admin/claims", suggestion: "Use ROUTES.adminClaims." },
  { value: '"/api/debug', suggestion: "Production UI must not call debug APIs." },
  { value: "'/api/debug", suggestion: "Production UI must not call debug APIs." },
];

const allowedLegacyFiles = new Set([
  "app/admin/dashboard/business-crm/page.tsx",
  "app/admin/dashboard/business-crm/[id]/page.tsx",
  "app/admin/dashboard/my-workspace/crm/page.tsx",
  "app/admin/dashboard/my-workspace/crm/[locationId]/page.tsx",
  "app/my-workspace/crm/page.tsx",
  "app/my-workspace/crm/[locationId]/page.tsx",
  "app/reserve/portal/page.tsx",
  "app/reserve/portal/reservations/page.tsx",
  "app/dashboard/reservations/page.tsx",
  "app/business/dashboard/reservations/page.tsx",
  "app/admin/claims/page.tsx",
  "app/api/reservations/waitlist/route.ts",
]);

function shouldSkip(path: string) {
  if (allowedLegacyFiles.has(path)) return true;
  if (path.includes("/__tests__/")) return true;
  if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) return true;
  if (path.includes("/docs/") || path.startsWith("docs/")) return true;
  if (path.includes("/.next/") || path.includes("/node_modules/")) return true;
  return false;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) return walk(fullPath);
    if (!stats.isFile()) return [];
    if (![...extensions].some((ext) => fullPath.endsWith(ext))) return [];

    return [relative(process.cwd(), fullPath).replaceAll("\\\\", "/")];
  });
}

describe("repo-wide route link scan", () => {
  it("does not use legacy duplicate route strings in production source", () => {
    const failures: string[] = [];

    for (const file of sourceRoots.flatMap(walk)) {
      if (shouldSkip(file)) continue;

      const source = readFileSync(file, "utf8");
      for (const banned of bannedReferences) {
        if (source.includes(banned.value)) {
          failures.push(`${file} contains ${banned.value}. ${banned.suggestion}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
