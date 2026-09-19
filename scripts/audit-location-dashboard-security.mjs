import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

function walk(dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(next) : [next];
  });
}

const layout = read("apps/business/app/locations/dashboard/layout.tsx");
const template = read("apps/business/app/locations/dashboard/template.tsx");
const dashboard = read("apps/business/app/locations/dashboard/page.tsx");
const supportPage = read("apps/business/app/locations/dashboard/support/page.tsx");
const supportActions = read("apps/business/app/locations/dashboard/support/actions.ts");
const ownerAccess = read("lib/auth/locationOwnerAccess.ts");
const trends = read("app/api/locations/dashboard/business-trends/route.ts");
const clearInvalid = read("app/api/locations/dashboard/clear-invalid-impersonation/route.ts");

const adminCookieNames = [
  "theouthaven_impersonate_location_id",
  "theouthaven_impersonate_user_id",
  "theouthaven_admin_user_id",
  "theouthaven_impersonate_target_type",
];

const reservePortalRoutes = walk("app/api/reserve/portal").filter((p) => p.endsWith("/route.ts"));
const writeGuardTokens = [
  "requireReservePermission",
  "requireAdminLocationApiWrite",
  "requireOwnerOrAdminAccessToLocation",
  "requireLocationPermission",
];
const readGuardTokens = [
  ...writeGuardTokens,
  "requireAdminLocationApiRead",
];

const reservePortalRisks = [];
for (const route of reservePortalRoutes) {
  const source = read(route);
  if (!source.includes("supabaseAdmin")) continue;
  const hasWriteHandler = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/.test(source);
  const hasReadHandler = /export\s+async\s+function\s+GET\b/.test(source);
  if (hasWriteHandler && !writeGuardTokens.some((token) => source.includes(token))) {
    reservePortalRisks.push({ route, risk: "privileged mutation without recognized location write guard" });
  }
  if (hasReadHandler && !readGuardTokens.some((token) => source.includes(token))) {
    reservePortalRisks.push({ route, risk: "privileged read without recognized location read guard" });
  }
}

const checks = {
  dashboardLayoutRequiresAuthenticatedUser:
    layout.includes("auth.getUser()") && layout.includes("/login?next=/locations/dashboard"),
  dashboardUsesCentralOwnerAccess:
    dashboard.includes("getLocationOwnerAccess") && dashboard.includes("hasOwnerAccessToLocation"),
  impersonationCookiesRequireVerifiedAdmin:
    template.includes("getLocationOwnerAccess(user.id)") &&
    template.includes("!access.isAdmin") &&
    adminCookieNames.every((name) => template.includes(name)),
  invalidImpersonationCookiesAreCleared:
    clearInvalid.includes("response.cookies.delete") &&
    adminCookieNames.every((name) => clearInvalid.includes(name)) &&
    !clearInvalid.includes("searchParams.get"),
  supportPageRequiresLocationAccess:
    supportPage.includes("requireOwnerOrAdminAccessToLocation") &&
    supportPage.includes('.eq("user_id", user.id)') &&
    !supportPage.includes('.select("*")'),
  supportActionsRequireLocationAccess:
    supportActions.includes("requireOwnerOrAdminAccessToLocation") &&
    supportActions.includes('.eq("user_id", user.id)') &&
    !supportActions.includes("user_metadata") &&
    !supportActions.includes("owner_phone"),
  ownerAccessNeverTrustsUserMetadataForPrivileges:
    ownerAccess.includes("Only app_metadata is server-controlled") &&
    !/user_metadata\?\.(?:role|admin_role)/.test(ownerAccess),
  businessTrendsOwnerScopedAndLeastData:
    trends.includes("auth.getUser()") &&
    trends.includes("hasOwnerAccessToLocation") &&
    !trends.includes('.select("*")'),
  reservePortalPrivilegedRoutesHaveLocationGuards:
    reservePortalRisks.length === 0,
};

const warnings = [];
if (dashboard.includes('.select("*")')) warnings.push("dashboard overview still contains broad select(*) aggregate reads");
if (/owner_(?:email|phone|name)/.test(dashboard)) warnings.push("dashboard location projection still references owner contact fields");
if (!exists("apps/business/app/locations/dashboard/template.tsx")) warnings.push("location dashboard impersonation template is missing");

const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
console.log(JSON.stringify({
  checks,
  reservePortalRouteCount: reservePortalRoutes.length,
  reservePortalRisks,
  warnings,
  failed,
}, null, 2));
if (failed.length) {
  console.error(`Location dashboard security audit failed: ${failed.join(", ")}`);
  process.exit(1);
}
