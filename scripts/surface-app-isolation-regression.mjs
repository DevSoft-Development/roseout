#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const surfaces = ["consumer", "admin", "business"];
const sharedPackages = ["auth", "config", "db"];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

for (const packageName of sharedPackages) {
  const packageRoot = path.join(root, "packages", packageName);
  if (!fs.existsSync(packageRoot)) {
    throw new Error(`Missing shared package: packages/${packageName}`);
  }
  if (!fs.existsSync(path.join(packageRoot, "package.json"))) {
    throw new Error(`Missing package manifest: packages/${packageName}/package.json`);
  }
}

for (const surface of surfaces) {
  const appRoot = path.join(root, "apps", surface);
  for (const required of ["app", "next.config.ts", "tsconfig.json"]) {
    if (!fs.existsSync(path.join(appRoot, required))) {
      throw new Error(`Missing ${surface} surface file: ${required}`);
    }
  }

  const tsconfig = read(`apps/${surface}/tsconfig.json`);
  if (!tsconfig.includes('"@/*": ["./*"]')) {
    throw new Error(`${surface} must resolve @/* inside its own app boundary.`);
  }
  for (const packageName of sharedPackages) {
    if (!tsconfig.includes(`"@theouthaven/${packageName}/*"`)) {
      throw new Error(`${surface} must expose the @theouthaven/${packageName} shared package alias.`);
    }
  }

  const sourceFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) sourceFiles.push(full);
    }
  };
  walk(path.join(appRoot, "app"));

  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    if (/from\s+["']\.\.\/\.\.\/\.\.\/(app|components|lib)\//.test(source)) {
      throw new Error(`${surface} app may not import the root monolith directly: ${path.relative(root, file)}`);
    }
  }
}

const adminLogin = read("apps/admin/app/admin/login/page.tsx");
if (!adminLogin.includes("@theouthaven/auth/browser-client") || !adminLogin.includes("@theouthaven/auth/redirect")) {
  throw new Error("Admin login must consume the shared auth package boundary.");
}

const adminSession = read("packages/auth/admin-session.ts");
for (const dependency of [
  "./server-client",
  "./admin-roles",
  "@theouthaven/db/admin-client",
]) {
  if (!adminSession.includes(dependency)) {
    throw new Error(`Admin session guard must consume isolated dependency: ${dependency}`);
  }
}
if (adminSession.includes("@/lib/")) {
  throw new Error("Shared Admin session guard must not import root monolith modules.");
}

const adminRootLayout = read("apps/admin/app/layout.tsx");
if (!adminRootLayout.includes("./globals.css")) {
  throw new Error("Isolated Admin root layout must load its own global stylesheet.");
}
const adminGlobals = read("apps/admin/app/globals.css");
if (!adminGlobals.includes('@import "tailwindcss"')) {
  throw new Error("Isolated Admin global stylesheet must compile Tailwind utilities.");
}

const adminDashboardLayout = read("apps/admin/app/admin/dashboard/layout.tsx");
if (!adminDashboardLayout.includes("@theouthaven/auth/admin-session") || !adminDashboardLayout.includes("./AdminShell")) {
  throw new Error("Admin dashboard must use the isolated session guard and Admin shell.");
}

const adminShell = read("apps/admin/app/admin/dashboard/AdminShell.tsx");
if (!adminShell.includes("@theouthaven/auth/browser-client") || adminShell.includes("@/lib/")) {
  throw new Error("Admin shell must use shared auth and must not import root monolith modules.");
}

const adminCallback = read("apps/admin/app/auth/admin/callback/route.ts");
for (const dependency of [
  "@theouthaven/auth/server-client",
  "@theouthaven/auth/admin-roles",
  "@theouthaven/config/web-surface-origin",
  "@theouthaven/db/admin-client",
]) {
  if (!adminCallback.includes(dependency)) {
    throw new Error(`Admin OAuth callback must consume shared dependency: ${dependency}`);
  }
}
if (adminCallback.includes("@/lib/supabase") || adminCallback.includes("@/lib/users/roles")) {
  throw new Error("Admin OAuth callback must not depend on root monolith auth/database modules.");
}

const platformErrorsPage = read("apps/admin/app/admin/dashboard/platform-errors/page.tsx");
if (!platformErrorsPage.includes('@theouthaven/auth/admin-session') || !platformErrorsPage.includes('@/lib/platform-errors')) {
  throw new Error("Platform Errors page must use isolated Admin auth and data loader.");
}
if (platformErrorsPage.includes("@/lib/supabase") || platformErrorsPage.includes("@/lib/admin-auth")) {
  throw new Error("Platform Errors page must not import root monolith auth/database modules.");
}

const platformErrorsApi = read("apps/admin/app/api/admin/platform-errors/route.ts");
if (!platformErrorsApi.includes("@theouthaven/auth/admin-session") || !platformErrorsApi.includes("@/lib/platform-errors")) {
  throw new Error("Platform Errors API must use isolated Admin auth and data loader.");
}

const platformErrorsLoader = read("apps/admin/lib/platform-errors.ts");
if (!platformErrorsLoader.includes("@theouthaven/db/admin-client") || platformErrorsLoader.includes("@/lib/")) {
  throw new Error("Platform Errors data loader must use the shared DB package and avoid root lib imports.");
}

const adminNavigation = read("apps/admin/app/admin/dashboard/admin-navigation.ts");
if (!adminNavigation.includes("/admin/dashboard/platform-errors") || !adminNavigation.includes('roles: ["superadmin"]')) {
  throw new Error("Platform Errors navigation must remain migrated and superadmin-only.");
}

const platformLogsPage = read("apps/admin/app/admin/dashboard/logs/page.tsx");
if (!platformLogsPage.includes("@theouthaven/auth/admin-session") || !platformLogsPage.includes("@/lib/admin-logs")) {
  throw new Error("Platform Logs page must use isolated Admin auth and data loader.");
}
if (platformLogsPage.includes("@/lib/supabase") || platformLogsPage.includes("@/lib/admin-auth")) {
  throw new Error("Platform Logs page must not import root monolith auth/database modules.");
}

const platformLogsApi = read("apps/admin/app/api/admin/logs/route.ts");
if (!platformLogsApi.includes("@theouthaven/auth/admin-session") || !platformLogsApi.includes("@/lib/admin-logs")) {
  throw new Error("Platform Logs API must use isolated Admin auth and data loader.");
}

const platformLogsLoader = read("apps/admin/lib/admin-logs.ts");
if (!platformLogsLoader.includes("@theouthaven/db/admin-client") || platformLogsLoader.includes("@/lib/")) {
  throw new Error("Platform Logs data loader must use the shared DB package and avoid root lib imports.");
}

if (!adminNavigation.includes("/admin/dashboard/logs")) {
  throw new Error("Platform Logs navigation must be present in the isolated Admin shell.");
}

const featureFlagsPage = read("apps/admin/app/admin/dashboard/feature-flags/page.tsx");
if (!featureFlagsPage.includes("@theouthaven/auth/admin-session") || !featureFlagsPage.includes("@/lib/feature-flags")) {
  throw new Error("Feature Flags page must use isolated Admin auth and data loader.");
}
if (featureFlagsPage.includes("@/lib/supabase") || featureFlagsPage.includes("@/lib/admin-auth")) {
  throw new Error("Feature Flags page must not import root monolith auth/database modules.");
}

const featureFlagsApi = read("apps/admin/app/api/admin/feature-flags/route.ts");
if (!featureFlagsApi.includes("@theouthaven/auth/admin-session") || !featureFlagsApi.includes("@/lib/feature-flags")) {
  throw new Error("Feature Flags API must use isolated Admin auth and data loader.");
}

const featureFlagsLoader = read("apps/admin/lib/feature-flags.ts");
if (!featureFlagsLoader.includes("@theouthaven/db/admin-client") || featureFlagsLoader.includes("@/lib/")) {
  throw new Error("Feature Flags data loader must use the shared DB package and avoid root lib imports.");
}

if (!adminNavigation.includes("/admin/dashboard/feature-flags")) {
  throw new Error("Feature Flags navigation must be present in the isolated Admin shell.");
}

const reviewsPage = read("apps/admin/app/admin/dashboard/reviews/page.tsx");
if (!reviewsPage.includes("@theouthaven/auth/admin-session") || !reviewsPage.includes("@/lib/reviews")) {
  throw new Error("Reviews page must use isolated Admin auth and data loader.");
}
if (reviewsPage.includes("@/lib/supabase") || reviewsPage.includes("@/lib/admin-auth")) {
  throw new Error("Reviews page must not import root monolith auth/database modules.");
}

const reviewsApi = read("apps/admin/app/api/admin/reviews/route.ts");
if (!reviewsApi.includes("@theouthaven/auth/admin-session") || !reviewsApi.includes("@/lib/reviews")) {
  throw new Error("Reviews API must use isolated Admin auth and data loader.");
}

const reviewsLoader = read("apps/admin/lib/reviews.ts");
if (!reviewsLoader.includes("@theouthaven/db/admin-client") || reviewsLoader.includes("@/lib/")) {
  throw new Error("Reviews data loader must use the shared DB package and avoid root lib imports.");
}

if (!adminNavigation.includes("/admin/dashboard/reviews")) {
  throw new Error("Reviews navigation must be present in the isolated Admin shell.");
}

const launchChecklistPage = read("apps/admin/app/admin/dashboard/launch-checklist/page.tsx");
if (!launchChecklistPage.includes("@theouthaven/auth/admin-session")) {
  throw new Error("Launch Checklist page must use isolated Admin auth.");
}
if (launchChecklistPage.includes("@/lib/")) {
  throw new Error("Launch Checklist page must not import root monolith modules.");
}
if (!adminNavigation.includes("/admin/dashboard/launch-checklist")) {
  throw new Error("Launch Checklist navigation must be present in the isolated Admin shell.");
}

const dataQualityPage = read("apps/admin/app/admin/dashboard/data-quality/page.tsx");
if (!dataQualityPage.includes("@theouthaven/auth/admin-session")) {
  throw new Error("Data Quality page must use isolated Admin auth.");
}
if (dataQualityPage.includes("@/lib/")) {
  throw new Error("Data Quality page must not import root monolith modules.");
}
if (!adminNavigation.includes("/admin/dashboard/data-quality")) {
  throw new Error("Data Quality navigation must be present in the isolated Admin shell.");
}

const promoCodesPage = read("apps/admin/app/admin/dashboard/settings/promo-codes/page.tsx");
if (!promoCodesPage.includes("@theouthaven/auth/admin-session") || !promoCodesPage.includes('requireAdminRole(["superadmin"])')) {
  throw new Error("Promo Codes page must enforce isolated superadmin authorization.");
}

const promoCodesClient = read("apps/admin/app/admin/dashboard/settings/promo-codes/PromoCodesClient.tsx");
if (!promoCodesClient.includes("/api/admin/promo-codes")) {
  throw new Error("Promo Codes client must use the isolated Admin API routes.");
}

for (const promoRoute of [
  "apps/admin/app/api/admin/promo-codes/route.ts",
  "apps/admin/app/api/admin/promo-codes/[id]/route.ts",
  "apps/admin/app/api/admin/promo-codes/generate/route.ts",
]) {
  const source = read(promoRoute);
  if (!source.includes("@/lib/admin-api-auth") || !source.includes('["superadmin"]')) {
    throw new Error(`Promo Codes API must enforce isolated superadmin authorization: ${promoRoute}`);
  }
  if (source.includes("@/lib/supabase-admin") || source.includes("@/lib/admin-permissions")) {
    throw new Error(`Promo Codes API must not import root monolith auth/database modules: ${promoRoute}`);
  }
}

const promoCodesHelper = read("apps/admin/lib/promo-codes.ts");
if (!promoCodesHelper.includes("@theouthaven/db/admin-client")) {
  throw new Error("Promo Codes helper must use the shared Admin DB package.");
}

if (!adminNavigation.includes("/admin/dashboard/settings/promo-codes")) {
  throw new Error("Promo Codes navigation must be present in the isolated Admin shell.");
}

const securityPage = read("apps/admin/app/admin/dashboard/security/page.tsx");
if (!securityPage.includes("@theouthaven/auth/admin-session") || !securityPage.includes("@/lib/security")) {
  throw new Error("Security page must use isolated Admin auth and data loader.");
}
if (!securityPage.includes('requireAdminRole(["superadmin"])')) {
  throw new Error("Security page must remain superadmin-only.");
}
if (securityPage.includes("@/lib/admin-auth") || securityPage.includes("@/lib/admin-system")) {
  throw new Error("Security page must not import root monolith auth/system modules.");
}

const securityApi = read("apps/admin/app/api/admin/system/security/[userId]/route.ts");
if (!securityApi.includes("@theouthaven/auth/admin-session") || !securityApi.includes("@/lib/security")) {
  throw new Error("Security access API must use isolated Admin auth and security loader.");
}
if (!securityApi.includes('requireAdminRole(["superadmin"])')) {
  throw new Error("Security access API must remain superadmin-only.");
}

const securityLoader = read("apps/admin/lib/security.ts");
if (!securityLoader.includes("@theouthaven/db/admin-client") || securityLoader.includes("@/lib/")) {
  throw new Error("Security loader must use the shared Admin DB package and avoid root lib imports.");
}

if (!adminNavigation.includes("/admin/dashboard/security")) {
  throw new Error("Security navigation must be present in the isolated Admin shell.");
}

for (const microsoftRuntimeFile of [
  "apps/admin/lib/web-surface-auth-origin.ts",
  "apps/admin/lib/microsoft-365/credential-vault.ts",
  "apps/admin/lib/microsoft-365/config.ts",
  "apps/admin/lib/microsoft-365/crypto.ts",
  "apps/admin/lib/microsoft-365/integration-api.ts",
  "apps/admin/lib/microsoft-365/oauth.ts",
  "apps/admin/lib/microsoft-365/graph.ts",
]) {
  const source = read(microsoftRuntimeFile);
  if (source.includes("@/lib/")) {
    throw new Error(`Microsoft 365 isolated runtime must not import root monolith modules: ${microsoftRuntimeFile}`);
  }
}
const microsoftGraphRuntime = read("apps/admin/lib/microsoft-365/graph.ts");
if (!microsoftGraphRuntime.includes("@theouthaven/db/admin-client")) {
  throw new Error("Microsoft 365 Graph runtime must use the shared Admin DB package.");
}
const microsoftConfigRuntime = read("apps/admin/lib/microsoft-365/config.ts");
if (!microsoftConfigRuntime.includes("./credential-vault")) {
  throw new Error("Microsoft 365 config must preserve credential-vault resolution.");
}
const microsoftIntegrationRuntime = read("apps/admin/lib/microsoft-365/integration-api.ts");
if (!microsoftIntegrationRuntime.includes("AWS_PLATFORM_INTEGRATION_API_URL") || !microsoftIntegrationRuntime.includes("createHmac")) {
  throw new Error("Microsoft 365 integration runtime must preserve signed AWS integration calls.");
}

for (const microsoftConnectionRoute of [
  "apps/admin/app/api/admin/integrations/microsoft-365/connect/route.ts",
  "apps/admin/app/api/admin/integrations/microsoft-365/callback/route.ts",
  "apps/admin/app/api/admin/integrations/microsoft-365/preferences/route.ts",
  "apps/admin/app/api/admin/integrations/microsoft-365/disconnect/route.ts",
]) {
  const source = read(microsoftConnectionRoute);
  if (!source.includes("@theouthaven/auth/admin-session")) {
    throw new Error(`Microsoft 365 connection route must use isolated Admin auth: ${microsoftConnectionRoute}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`Microsoft 365 connection route must not import root monolith auth/database modules: ${microsoftConnectionRoute}`);
  }
}

const microsoftConnectRoute = read("apps/admin/app/api/admin/integrations/microsoft-365/connect/route.ts");
if (
  !microsoftConnectRoute.includes("@theouthaven/auth/redirect") ||
  !microsoftConnectRoute.includes("@/lib/microsoft-365/config") ||
  !microsoftConnectRoute.includes("@/lib/web-surface-auth-origin") ||
  !microsoftConnectRoute.includes("/api/admin/integrations/microsoft-365/callback")
) {
  throw new Error("Microsoft 365 connect route must preserve Admin-origin PKCE OAuth flow.");
}

const microsoftCallbackRoute = read("apps/admin/app/api/admin/integrations/microsoft-365/callback/route.ts");
for (const dependency of [
  "@theouthaven/auth/redirect",
  "@theouthaven/db/admin-client",
  "@/lib/microsoft-365/config",
  "@/lib/microsoft-365/crypto",
  "@/lib/microsoft-365/graph",
  "@/lib/microsoft-365/oauth",
  "@/lib/web-surface-auth-origin",
]) {
  if (!microsoftCallbackRoute.includes(dependency)) {
    throw new Error(`Microsoft 365 callback must use isolated dependency: ${dependency}`);
  }
}
if (
  !microsoftCallbackRoute.includes("toh_m365_state") ||
  !microsoftCallbackRoute.includes("toh_m365_pkce") ||
  !microsoftCallbackRoute.includes("The Microsoft 365 account must match")
) {
  throw new Error("Microsoft 365 callback must preserve OAuth state, PKCE, and identity matching.");
}

for (const microsoftDbRoute of [
  "apps/admin/app/api/admin/integrations/microsoft-365/preferences/route.ts",
  "apps/admin/app/api/admin/integrations/microsoft-365/disconnect/route.ts",
]) {
  const source = read(microsoftDbRoute);
  if (!source.includes("@theouthaven/db/admin-client")) {
    throw new Error(`Microsoft 365 DB route must use shared Admin DB package: ${microsoftDbRoute}`);
  }
}

for (const microsoftSyncRuntimeFile of [
  "apps/admin/lib/microsoft-365/matching.ts",
  "apps/admin/lib/microsoft-365/subscriptions.ts",
  "apps/admin/lib/microsoft-365/sync.ts",
  "apps/admin/lib/microsoft-365/task-crm-sync.ts",
  "apps/admin/lib/microsoft-365/sync-with-crm.ts",
]) {
  const source = read(microsoftSyncRuntimeFile);
  if (source.includes("@/lib/")) {
    throw new Error(`Microsoft 365 sync runtime must not import root monolith modules: ${microsoftSyncRuntimeFile}`);
  }
}

for (const microsoftDbRuntimeFile of [
  "apps/admin/lib/microsoft-365/matching.ts",
  "apps/admin/lib/microsoft-365/sync.ts",
  "apps/admin/lib/microsoft-365/task-crm-sync.ts",
  "apps/admin/lib/microsoft-365/sync-with-crm.ts",
]) {
  const source = read(microsoftDbRuntimeFile);
  if (!source.includes("@theouthaven/db/admin-client")) {
    throw new Error(`Microsoft 365 sync runtime must use shared Admin DB package: ${microsoftDbRuntimeFile}`);
  }
}

const microsoftSyncRoute = read("apps/admin/app/api/admin/integrations/microsoft-365/sync/route.ts");
if (
  !microsoftSyncRoute.includes("@theouthaven/auth/admin-session") ||
  !microsoftSyncRoute.includes("@theouthaven/auth/redirect") ||
  !microsoftSyncRoute.includes("@/lib/microsoft-365/sync-with-crm")
) {
  throw new Error("Microsoft 365 sync route must use isolated Admin auth, redirect, and sync runtime.");
}
if (microsoftSyncRoute.includes("@/lib/admin-auth") || microsoftSyncRoute.includes("@/lib/auth-redirect")) {
  throw new Error("Microsoft 365 sync route must not import root monolith auth helpers.");
}

const microsoftSettingsPage = read("apps/admin/app/admin/dashboard/settings/microsoft-365/page.tsx");
if (
  !microsoftSettingsPage.includes("@theouthaven/auth/admin-session") ||
  !microsoftSettingsPage.includes("@theouthaven/db/admin-client")
) {
  throw new Error("Microsoft 365 settings page must use isolated Admin auth and shared DB.");
}
if (
  microsoftSettingsPage.includes("@/lib/admin-auth") ||
  microsoftSettingsPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Microsoft 365 settings page must not import root monolith auth/database modules.");
}
for (const actionPath of [
  "/api/admin/integrations/microsoft-365/connect",
  "/api/admin/integrations/microsoft-365/sync",
  "/api/admin/integrations/microsoft-365/preferences",
  "/api/admin/integrations/microsoft-365/disconnect",
]) {
  if (!microsoftSettingsPage.includes(actionPath)) {
    throw new Error(`Microsoft 365 settings page must retain isolated action: ${actionPath}`);
  }
}
if (
  !adminNavigation.includes("/admin/dashboard/settings/microsoft-365") ||
  !adminNavigation.includes('label: "Microsoft 365"')
) {
  throw new Error("Microsoft 365 navigation must be present in the isolated Admin shell.");
}
if (
  adminNavigation.includes('label: "Microsoft 365"') &&
  !adminNavigation.includes('migrated: true')
) {
  throw new Error("Microsoft 365 navigation must be marked migrated after page and sync migration.");
}

const intuneDevicesPage = read("apps/admin/app/admin/dashboard/security/devices/page.tsx");
if (
  !intuneDevicesPage.includes("@theouthaven/auth/admin-session") ||
  !intuneDevicesPage.includes("@/lib/microsoft-365/intune") ||
  !intuneDevicesPage.includes('requireAdminRole(["superadmin"])')
) {
  throw new Error("Device Management page must use isolated superadmin auth and Intune runtime.");
}
if (
  intuneDevicesPage.includes("@/lib/admin-auth") ||
  intuneDevicesPage.includes("@/lib/admin-permissions")
) {
  throw new Error("Device Management page must not import root monolith auth/permission modules.");
}

const intuneDeviceActionRoute = read("apps/admin/app/api/admin/integrations/intune/device-action/route.ts");
if (
  !intuneDeviceActionRoute.includes("@theouthaven/auth/admin-session") ||
  !intuneDeviceActionRoute.includes("@/lib/microsoft-365/intune") ||
  !intuneDeviceActionRoute.includes('requireAdminRole(["superadmin"])')
) {
  throw new Error("Intune device action must remain isolated and superadmin-only.");
}
if (!intuneDeviceActionRoute.includes('action !== "syncDevice"')) {
  throw new Error("Intune device action route must remain restricted to syncDevice.");
}

const intuneRuntime = read("apps/admin/lib/microsoft-365/intune.ts");
if (
  !intuneRuntime.includes("./graph") ||
  intuneRuntime.includes("@/lib/")
) {
  throw new Error("Intune runtime must use isolated Microsoft Graph helpers and avoid root lib imports.");
}

const appleEnrollmentPage = read("apps/admin/app/admin/dashboard/security/apple-devices/page.tsx");
if (
  !appleEnrollmentPage.includes("@theouthaven/auth/admin-session") ||
  !appleEnrollmentPage.includes("@/lib/apple-business/api") ||
  !appleEnrollmentPage.includes("@/lib/microsoft-365/intune") ||
  !appleEnrollmentPage.includes('requireAdminRole(["superadmin"])')
) {
  throw new Error("Apple Enrollment page must use isolated superadmin auth, Apple Business runtime, and Intune runtime.");
}
if (
  appleEnrollmentPage.includes("@/lib/admin-auth") ||
  appleEnrollmentPage.includes("@/lib/admin-permissions") ||
  appleEnrollmentPage.includes("@/components/admin/")
) {
  throw new Error("Apple Enrollment page must not import root monolith Admin modules/components.");
}

const appleEnrollmentRoute = read("apps/admin/app/api/admin/integrations/apple-device-enrollment/prepare/route.ts");
if (
  !appleEnrollmentRoute.includes("@theouthaven/auth/admin-session") ||
  !appleEnrollmentRoute.includes("@/lib/apple-business/api") ||
  !appleEnrollmentRoute.includes("@/lib/microsoft-365/intune") ||
  !appleEnrollmentRoute.includes('requireAdminRole(["superadmin"])')
) {
  throw new Error("Apple Enrollment action route must remain isolated and superadmin-only.");
}
if (
  !appleEnrollmentRoute.includes('action === "prepare"') ||
  !appleEnrollmentRoute.includes('action !== "sync-intune"')
) {
  throw new Error("Apple Enrollment action route must remain restricted to prepare and sync-intune.");
}

const appleBusinessRuntime = read("apps/admin/lib/apple-business/api.ts");
if (appleBusinessRuntime.includes("@/lib/")) {
  throw new Error("Apple Business runtime must not import root monolith modules.");
}

const domainBenefitPage = read("apps/admin/app/admin/dashboard/settings/domain-benefit/page.tsx");
if (
  !domainBenefitPage.includes("@theouthaven/auth/admin-session") ||
  !domainBenefitPage.includes("@/lib/domains/benefit-settings")
) {
  throw new Error("Domain Benefit page must use isolated Admin auth and domain benefit runtime.");
}
if (
  domainBenefitPage.includes("@/lib/admin-auth") ||
  domainBenefitPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Domain Benefit page must not import root monolith auth/database modules.");
}

const domainBenefitRoute = read("apps/admin/app/api/admin/settings/domain-benefit/route.ts");
if (
  !domainBenefitRoute.includes("@theouthaven/auth/admin-session") ||
  !domainBenefitRoute.includes("@theouthaven/db/admin-client") ||
  !domainBenefitRoute.includes("@/lib/domains/benefit-settings")
) {
  throw new Error("Domain Benefit route must use isolated Admin auth, shared DB, and local settings helper.");
}
if (
  domainBenefitRoute.includes("@/lib/supabase-server") ||
  domainBenefitRoute.includes("@/lib/supabase-admin") ||
  domainBenefitRoute.includes("@/lib/auth/get-admin-login-role")
) {
  throw new Error("Domain Benefit route must not import root monolith Supabase/auth helpers.");
}

const domainBenefitRuntime = read("apps/admin/lib/domains/benefit-settings.ts");
if (
  !domainBenefitRuntime.includes("@theouthaven/db/admin-client") ||
  domainBenefitRuntime.includes("@/lib/supabase-admin")
) {
  throw new Error("Domain Benefit runtime must use the shared Admin DB package.");
}

const generatedWebsitesPage = read("apps/admin/app/admin/dashboard/settings/websites/page.tsx");
if (
  !generatedWebsitesPage.includes("@theouthaven/auth/admin-session") ||
  !generatedWebsitesPage.includes('requireAdminRole(["superadmin"])')
) {
  throw new Error("Generated Websites page must remain isolated and superadmin-only.");
}
if (
  generatedWebsitesPage.includes("@/lib/admin-auth") ||
  generatedWebsitesPage.includes("@/components/admin/")
) {
  throw new Error("Generated Websites page must not import root monolith Admin modules/components.");
}

const generatedWebsitesRoute = read("apps/admin/app/api/admin/websites/route.ts");
if (
  !generatedWebsitesRoute.includes("@theouthaven/auth/admin-session") ||
  !generatedWebsitesRoute.includes("@theouthaven/db/admin-client") ||
  !generatedWebsitesRoute.includes('requireAdminRole(["superadmin"])')
) {
  throw new Error("Generated Websites route must use isolated superadmin auth and shared Admin DB.");
}
if (
  generatedWebsitesRoute.includes("@/lib/admin-api-auth") ||
  generatedWebsitesRoute.includes("@/lib/supabase-admin")
) {
  throw new Error("Generated Websites route must not import root monolith auth/database modules.");
}
if (!generatedWebsitesRoute.includes('confirmation !== "DELETE"')) {
  throw new Error("Generated Websites delete route must retain explicit DELETE confirmation.");
}

const emailQaPage = read("apps/admin/app/admin/dashboard/settings/email-qa/page.tsx");
if (
  !emailQaPage.includes("@theouthaven/auth/admin-session") ||
  !emailQaPage.includes("@/lib/email/registry") ||
  !emailQaPage.includes("@/lib/email/sample-data")
) {
  throw new Error("Email QA page must use isolated Admin auth and local email runtime.");
}
if (
  emailQaPage.includes("@/lib/admin-auth") ||
  emailQaPage.includes("@/components/admin/")
) {
  throw new Error("Email QA page must not import root monolith Admin modules/components.");
}

for (const emailRuntimeFile of [
  "apps/admin/lib/email/types.ts",
  "apps/admin/lib/email/brand.ts",
  "apps/admin/lib/email/render.ts",
  "apps/admin/lib/email/templates.ts",
  "apps/admin/lib/email/sample-data.ts",
  "apps/admin/lib/email/registry.ts",
]) {
  const source = read(emailRuntimeFile);
  if (source.includes("@/lib/")) {
    throw new Error(`Email QA runtime must not import root monolith modules: ${emailRuntimeFile}`);
  }
}

const googlePlacesBudgetPage = read("apps/admin/app/admin/dashboard/settings/google-places/page.tsx");
if (
  !googlePlacesBudgetPage.includes("@theouthaven/auth/admin-session") ||
  !googlePlacesBudgetPage.includes("@/lib/google/google-places-budget") ||
  !googlePlacesBudgetPage.includes("@/lib/google/google-places-cost-control-admin") ||
  !googlePlacesBudgetPage.includes('requireAdminRole(["superadmin", "admin"])')
) {
  throw new Error("Google Places Budget page must use isolated Admin auth and local budget helpers.");
}
if (
  googlePlacesBudgetPage.includes("@/lib/supabase-admin") ||
  googlePlacesBudgetPage.includes('from "@/lib/google/google-places-cost-control"') ||
  googlePlacesBudgetPage.includes("from '@/lib/google/google-places-cost-control'")
) {
  throw new Error("Google Places Budget page must not import root monolith database/cost-control modules.");
}

const googlePlacesBudgetRoute = read("apps/admin/app/api/admin/settings/google-places-budget/route.ts");
if (
  !googlePlacesBudgetRoute.includes("@theouthaven/auth/admin-session") ||
  !googlePlacesBudgetRoute.includes("@theouthaven/db/admin-client") ||
  !googlePlacesBudgetRoute.includes("@/lib/google/google-places-budget") ||
  !googlePlacesBudgetRoute.includes("@/lib/google/google-places-cost-control-admin") ||
  !googlePlacesBudgetRoute.includes("@/lib/aws/location-intelligence-api")
) {
  throw new Error("Google Places Budget API must use isolated Admin auth, shared DB, and local AWS/budget helpers.");
}
if (
  googlePlacesBudgetRoute.includes("@/lib/supabase-server") ||
  googlePlacesBudgetRoute.includes("@/lib/supabase-admin") ||
  googlePlacesBudgetRoute.includes("@/lib/auth/get-admin-login-role")
) {
  throw new Error("Google Places Budget API must not import root monolith auth/database helpers.");
}

for (const googleBudgetRuntime of [
  "apps/admin/lib/google/google-places-budget.ts",
  "apps/admin/lib/google/google-places-cost-control-admin.ts",
  "apps/admin/lib/aws/location-intelligence-api.ts",
  "apps/admin/lib/aws/integration-api.ts",
  "apps/admin/lib/email/system-alerts.ts",
]) {
  const source = read(googleBudgetRuntime);
  if (source.includes("@/lib/supabase-admin") || source.includes("@/lib/aws/integration-api") && !googleBudgetRuntime.endsWith("email/system-alerts.ts")) {
    throw new Error(`Google budget runtime must not import root monolith infrastructure: ${googleBudgetRuntime}`);
  }
}
if (!read("apps/admin/lib/google/google-places-budget.ts").includes("@theouthaven/db/admin-client")) {
  throw new Error("Google Places Budget config must use the shared Admin DB package.");
}
if (!read("apps/admin/lib/google/google-places-cost-control-admin.ts").includes("@theouthaven/db/admin-client")) {
  throw new Error("Google Places cost-control snapshot must use the shared Admin DB package.");
}

const claimToolsPage = read("apps/admin/app/admin/dashboard/claim-tools/page.tsx");
if (
  !claimToolsPage.includes("@theouthaven/auth/admin-session") ||
  !claimToolsPage.includes('requireAdminRole(["superadmin", "admin", "ambassador"])')
) {
  throw new Error("Claim Tools page must preserve isolated claimTools role access.");
}
if (
  claimToolsPage.includes("@/lib/admin-auth") ||
  claimToolsPage.includes("@/lib/admin-permissions")
) {
  throw new Error("Claim Tools page must not import root monolith auth/permission modules.");
}

for (const claimToolsRoute of [
  "apps/admin/app/api/admin/claim-tools/route.ts",
  "apps/admin/app/api/admin/claim-tools/regenerate/route.ts",
]) {
  const source = read(claimToolsRoute);
  if (
    !source.includes("@theouthaven/auth/admin-session") ||
    !source.includes("@theouthaven/db/admin-client") ||
    !source.includes('requireAdminRole(["superadmin", "admin", "ambassador"])')
  ) {
    throw new Error(`Claim Tools API must preserve isolated role access and shared DB: ${claimToolsRoute}`);
  }
  if (
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Claim Tools API must not import root auth/database modules: ${claimToolsRoute}`);
  }
}

const claimQrServerRuntime = read("apps/admin/lib/claimQrServer.ts");
if (
  !claimQrServerRuntime.includes("@theouthaven/db/admin-client") ||
  claimQrServerRuntime.includes("@/lib/supabase-admin")
) {
  throw new Error("Claim QR server runtime must use shared Admin DB.");
}
for (const claimRuntimeFile of [
  "apps/admin/lib/address-utils.ts",
  "apps/admin/lib/claimQr.ts",
  "apps/admin/lib/site-url.ts",
]) {
  const source = read(claimRuntimeFile);
  if (source.includes("@/lib/")) {
    throw new Error(`Claim Tools helper must not import root monolith modules: ${claimRuntimeFile}`);
  }
}

const ticketOrdersPage = read("apps/admin/app/admin/dashboard/ticket-orders/page.tsx");
if (
  !ticketOrdersPage.includes("@theouthaven/auth/admin-session") ||
  !ticketOrdersPage.includes("@theouthaven/db/admin-client") ||
  !ticketOrdersPage.includes('requireAdminRole(["superadmin", "admin", "manager", "reviewer", "experience_team"])')
) {
  throw new Error("Ticket Orders page must use isolated Admin auth, shared DB, and preserve access roles.");
}
if (
  ticketOrdersPage.includes("@/lib/admin-auth") ||
  ticketOrdersPage.includes("@/lib/admin-permissions") ||
  ticketOrdersPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Ticket Orders page must not import root monolith auth/database modules.");
}
if (ticketOrdersPage.includes('href="/admin/dashboard/payouts"')) {
  throw new Error("Ticket Orders must not link to unmigrated Payouts from the isolated Admin app.");
}
if (!adminNavigation.includes("/admin/dashboard/ticket-orders")) {
  throw new Error("Ticket Orders navigation must be present in the isolated Admin shell.");
}

const locationToolsPage = read("apps/admin/app/admin/dashboard/settings/location-tools/page.tsx");
if (
  !locationToolsPage.includes("@theouthaven/auth/admin-session") ||
  !locationToolsPage.includes("@theouthaven/db/admin-client") ||
  !locationToolsPage.includes('requireAdminRole(["superadmin", "admin"])') ||
  !locationToolsPage.includes('MIRROR_DEMO_KEY = "real_location_mirror_demo"')
) {
  throw new Error("Location Tools launcher must use isolated Admin auth/shared DB and preserve the hidden demo lookup.");
}
if (
  locationToolsPage.includes("@/lib/admin-auth") ||
  locationToolsPage.includes("@/lib/demo/") ||
  locationToolsPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Location Tools launcher must not import root monolith auth/demo/database helpers.");
}

const locationToolsLogsPage = read("apps/admin/app/admin/dashboard/settings/location-tools/logs/page.tsx");
if (
  !locationToolsLogsPage.includes("@theouthaven/auth/admin-session") ||
  !locationToolsLogsPage.includes("@theouthaven/db/admin-client") ||
  !locationToolsLogsPage.includes("@/components/admin/location-tools/LocationToolShell") ||
  !locationToolsLogsPage.includes("@/components/admin/FriendlyJsonView")
) {
  throw new Error("Location Tools Logs must use isolated Admin auth/shared DB and local UI helpers.");
}
if (
  locationToolsLogsPage.includes("@/lib/admin-auth") ||
  locationToolsLogsPage.includes("@/lib/supabase-admin") ||
  locationToolsLogsPage.includes("@/components/admin/location-tools/LocationToolShell") === false
) {
  throw new Error("Location Tools Logs must not import root monolith auth/database helpers.");
}
for (const logsUiFile of [
  "apps/admin/components/admin/location-tools/LocationToolShell.tsx",
  "apps/admin/components/admin/FriendlyJsonView.tsx",
  "apps/admin/lib/display-values.ts",
]) {
  const source = read(logsUiFile);
  if (source.includes("../../../../components/") || source.includes("@/../")) {
    throw new Error(`Location Tools Logs helper must stay inside isolated Admin boundary: ${logsUiFile}`);
  }
}

const locationToolsMarketsPage = read("apps/admin/app/admin/dashboard/settings/location-tools/markets/page.tsx");
if (!locationToolsMarketsPage.includes("@theouthaven/auth/admin-session") || !locationToolsMarketsPage.includes("@theouthaven/db/admin-client")) {
  throw new Error("Location Tools Markets page must use isolated Admin auth and DB.");
}

const locationToolsMarketsApi = read("apps/admin/app/api/admin/location-growth/repair-markets/route.ts");
if (!locationToolsMarketsApi.includes("@theouthaven/auth/admin-session") || !locationToolsMarketsApi.includes("@theouthaven/db/admin-client") || !locationToolsMarketsApi.includes("@/lib/location-markets")) {
  throw new Error("Location Tools market repair API must use isolated Admin auth, DB, and market taxonomy.");
}

const hiddenLocationsPage = read("apps/admin/app/admin/dashboard/settings/location-tools/hidden-locations/page.tsx");
if (!hiddenLocationsPage.includes("@theouthaven/auth/admin-session") || !hiddenLocationsPage.includes("@theouthaven/db/admin-client") || !hiddenLocationsPage.includes("@/components/admin/location-tools/HiddenLocationsRepairClient")) {
  throw new Error("Hidden Locations page must use isolated Admin auth, DB, and local repair client.");
}

const hiddenLocationsApi = read("apps/admin/app/api/admin/locations/hidden-repair/route.ts");
if (!hiddenLocationsApi.includes("@theouthaven/auth/admin-session") || !hiddenLocationsApi.includes("@theouthaven/db/admin-client")) {
  throw new Error("Hidden Locations API must use isolated Admin auth and DB.");
}
if (hiddenLocationsApi.includes("requireAdminApiRole") || hiddenLocationsApi.includes("@/lib/supabase-admin")) {
  throw new Error("Hidden Locations API must not use root Admin auth/database helpers.");
}

const claimUrlsPage = read("apps/admin/app/admin/dashboard/settings/location-tools/claim-urls/page.tsx");
if (!claimUrlsPage.includes("@theouthaven/auth/admin-session") || !claimUrlsPage.includes("@theouthaven/db/admin-client") || !claimUrlsPage.includes("@/app/admin/dashboard/claim-tools/ClaimToolsClient") || !claimUrlsPage.includes("@/app/admin/dashboard/claim-qrs/RepairClaimQrButton")) {
  throw new Error("Claim URLs settings page must use isolated Admin auth/DB and isolated claim tooling.");
}

const claimQrPage = read("apps/admin/app/admin/dashboard/claim-qrs/page.tsx");
if (!claimQrPage.includes("@theouthaven/auth/admin-session") || !claimQrPage.includes("@theouthaven/db/admin-client") || !claimQrPage.includes("@/lib/claimQrServer")) {
  throw new Error("Claim QR print page must use isolated Admin auth, DB, and claim runtime.");
}
if (claimQrPage.includes("@/lib/admin-auth") || claimQrPage.includes("@/lib/supabase")) {
  throw new Error("Claim QR print page must not import root monolith auth/database helpers.");
}

const claimQrMaintenancePage = read("apps/admin/app/admin/dashboard/claim-qrs/maintenance/page.tsx");
if (!claimQrMaintenancePage.includes("@theouthaven/auth/admin-session") || !claimQrMaintenancePage.includes("@/lib/claimQrServer")) {
  throw new Error("Claim QR maintenance page must use isolated Admin auth and claim runtime.");
}

const claimQrBackfillApi = read("apps/admin/app/api/admin/locations/backfill-qr/route.ts");
if (!claimQrBackfillApi.includes("@theouthaven/auth/admin-session") || !claimQrBackfillApi.includes("@theouthaven/db/admin-client") || !claimQrBackfillApi.includes('requireAdminRole(["superadmin"])')) {
  throw new Error("Claim QR repair job API must preserve isolated superadmin authorization and shared DB access.");
}
if (claimQrBackfillApi.includes("@/lib/admin-auth") || claimQrBackfillApi.includes("@/lib/supabase-admin")) {
  throw new Error("Claim QR repair job API must not import root monolith auth/database helpers.");
}

const cronJobsPage = read("apps/admin/app/admin/dashboard/settings/cron-jobs/page.tsx");
if (
  !cronJobsPage.includes("@theouthaven/auth/admin-session") ||
  !cronJobsPage.includes('requireAdminRole(["superadmin", "admin"])')
) {
  throw new Error("Cron Jobs page must use isolated Admin auth and preserve admin/superadmin access.");
}

const cronJobsClient = read("apps/admin/app/admin/dashboard/settings/cron-jobs/CronJobsClient.tsx");
if (
  cronJobsClient.includes("@/components/admin/") ||
  !cronJobsClient.includes("./CronJobsUi")
) {
  throw new Error("Cron Jobs client must use local isolated UI primitives.");
}

for (const cronRoute of [
  "apps/admin/app/api/admin/cron-jobs/route.ts",
  "apps/admin/app/api/admin/cron-jobs/[jobKey]/route.ts",
  "apps/admin/app/api/admin/cron-jobs/[jobKey]/runs/route.ts",
  "apps/admin/app/api/admin/cron-jobs/[jobKey]/run/route.ts",
]) {
  const source = read(cronRoute);
  if (
    !source.includes("@/lib/admin-api-auth") ||
    !source.includes("@theouthaven/db/admin-client")
  ) {
    throw new Error(`Cron Jobs API must use isolated API auth and shared Admin DB: ${cronRoute}`);
  }
  if (
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/admin-api-auth") && !cronRoute.startsWith("apps/admin/")
  ) {
    throw new Error(`Cron Jobs API must not import root monolith DB/auth helpers: ${cronRoute}`);
  }
}

const cronRunRoute = read("apps/admin/app/api/admin/cron-jobs/[jobKey]/run/route.ts");
if (
  !cronRunRoute.includes('NEXT_PUBLIC_SITE_URL') ||
  !cronRunRoute.includes('new URL("/api/cron/managed", consumerOrigin)')
) {
  throw new Error("Manual Cron execution must target the consumer origin after Admin isolation.");
}

const cronControlPlane = read("apps/admin/lib/cron/controlPlane.ts");
if (
  cronControlPlane.includes("@/config/") ||
  cronControlPlane.includes("@/infra/") ||
  cronControlPlane.includes("@/vercel.json") ||
  !cronControlPlane.includes("./manifests/cron-jobs.json")
) {
  throw new Error("Cron control plane must use isolated deployment-manifest snapshots.");
}

const demoCenterPage = read("apps/admin/app/admin/dashboard/settings/demo-center/page.tsx");
if (
  !demoCenterPage.includes("@theouthaven/auth/admin-session") ||
  !demoCenterPage.includes("@theouthaven/auth/admin-roles") ||
  !demoCenterPage.includes("@theouthaven/db/admin-client") ||
  !demoCenterPage.includes("@/lib/demo/demo-center")
) {
  throw new Error("Demo Center page must use isolated Admin auth, shared DB, and local demo runtime.");
}
if (
  demoCenterPage.includes("@/lib/admin-auth") ||
  demoCenterPage.includes("@/lib/admin-permissions") ||
  demoCenterPage.includes("@/lib/supabase-admin") ||
  demoCenterPage.includes("@/lib/routes")
) {
  throw new Error("Demo Center page must not import root monolith Admin/database/route helpers.");
}
if (
  !demoCenterPage.includes("NEXT_PUBLIC_BUSINESS_SITE_URL") ||
  !demoCenterPage.includes("https://business.theouthaven.com")
) {
  throw new Error("Demo Center owner tools must route to the Business surface after Admin isolation.");
}

const demoCenterActions = read("apps/admin/app/admin/dashboard/settings/demo-center/actions.ts");
if (
  !demoCenterActions.includes("@theouthaven/auth/admin-session") ||
  !demoCenterActions.includes("@theouthaven/db/admin-client") ||
  !demoCenterActions.includes('requireAdminRole(["superadmin", "admin", "manager"])')
) {
  throw new Error("Demo Center actions must use isolated Admin auth/shared DB and preserve management roles.");
}
if (
  demoCenterActions.includes("@/lib/admin-auth") ||
  demoCenterActions.includes("@/lib/admin-permissions") ||
  demoCenterActions.includes("@/lib/supabase-admin")
) {
  throw new Error("Demo Center actions must not import root monolith auth/database modules.");
}

const demoCenterRuntime = read("apps/admin/lib/demo/demo-center.ts");
if (
  !demoCenterRuntime.includes("@theouthaven/db/admin-client") ||
  !demoCenterRuntime.includes("@/lib/email/send") ||
  demoCenterRuntime.includes("@/lib/supabase-admin")
) {
  throw new Error("Demo Center runtime must use shared Admin DB and isolated email runtime.");
}

const demoPublicProfile = read("apps/admin/app/admin/dashboard/settings/demo-center/public-profile/page.tsx");
if (
  !demoPublicProfile.includes("NEXT_PUBLIC_SITE_URL") ||
  !demoPublicProfile.includes("https://theouthaven.com") ||
  !demoPublicProfile.includes("@/lib/demo/demo-center")
) {
  throw new Error("Demo Center public profile redirect must target the Consumer surface using isolated demo data.");
}

for (const settingsSearchRuntime of [
  "apps/admin/lib/search-usage-limits.ts",
  "apps/admin/lib/ai-tag-helper-settings.ts",
  "apps/admin/lib/search/rankingRollout.ts",
  "apps/admin/lib/search/v2/retrieval/searchProfileMode.ts",
  "apps/admin/lib/search/v2/retrieval/searchProfileRolloutConfig.ts",
  "apps/admin/lib/search/searchCoreConfig.ts",
]) {
  const source = read(settingsSearchRuntime);
  if (
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/auth/get-admin-login-role")
  ) {
    throw new Error(`Settings search-control runtime must not import root monolith DB/auth helpers: ${settingsSearchRuntime}`);
  }
}

for (const settingsSearchDbRuntime of [
  "apps/admin/lib/ai-tag-helper-settings.ts",
  "apps/admin/lib/search/rankingRollout.ts",
  "apps/admin/lib/search/v2/retrieval/searchProfileRolloutConfig.ts",
  "apps/admin/lib/search/searchCoreConfig.ts",
]) {
  if (!read(settingsSearchDbRuntime).includes("@theouthaven/db/admin-client")) {
    throw new Error(`Settings search-control runtime must use shared Admin DB: ${settingsSearchDbRuntime}`);
  }
}

for (const settingsSearchRoute of [
  "apps/admin/app/api/admin/settings/search-limits/route.ts",
  "apps/admin/app/api/admin/settings/ai-tag-helper/route.ts",
  "apps/admin/app/api/admin/settings/search-ml-rollout/route.ts",
  "apps/admin/app/api/admin/settings/search-profile-rollout/route.ts",
  "apps/admin/app/api/admin/settings/search-core/route.ts",
]) {
  const source = read(settingsSearchRoute);
  if (!source.includes("@/lib/admin-api-auth")) {
    throw new Error(`Settings search-control API must use isolated Admin API auth: ${settingsSearchRoute}`);
  }
  if (
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Settings search-control API must not import root monolith permissions/DB helpers: ${settingsSearchRoute}`);
  }
}

const searchLimitsRoute = read("apps/admin/app/api/admin/settings/search-limits/route.ts");
const aiTagHelperRoute = read("apps/admin/app/api/admin/settings/ai-tag-helper/route.ts");
if (
  !searchLimitsRoute.includes('requireAdminApiRole(["superadmin"])') ||
  !aiTagHelperRoute.includes('requireAdminApiRole(["superadmin"])')
) {
  throw new Error("Search Limits and AI Tag Helper settings must remain superadmin-only.");
}

for (const rolloutRoute of [
  "apps/admin/app/api/admin/settings/search-ml-rollout/route.ts",
  "apps/admin/app/api/admin/settings/search-profile-rollout/route.ts",
  "apps/admin/app/api/admin/settings/search-core/route.ts",
]) {
  const source = read(rolloutRoute);
  if (
    !source.includes('"superadmin"') ||
    !source.includes('"admin"') ||
    !source.includes('"experience_team"')
  ) {
    throw new Error(`Search rollout API must preserve Search Health roles: ${rolloutRoute}`);
  }
}

const searchDocumentBackfillRoute = read("apps/admin/app/api/admin/locations/backfill-search-document/route.ts");
if (
  !searchDocumentBackfillRoute.includes("@/lib/admin-api-auth") ||
  !searchDocumentBackfillRoute.includes("@theouthaven/db/admin-client") ||
  !searchDocumentBackfillRoute.includes("@/lib/admin/location-data-projections") ||
  !searchDocumentBackfillRoute.includes("@/lib/location-profile-fields") ||
  !searchDocumentBackfillRoute.includes('requireAdminApiRole(["superadmin"])')
) {
  throw new Error("Search-document backfill API must use isolated superadmin auth, shared DB, and local document helpers.");
}
if (
  searchDocumentBackfillRoute.includes("@/lib/admin-permissions") ||
  searchDocumentBackfillRoute.includes("@/lib/supabase-admin")
) {
  throw new Error("Search-document backfill API must not import root monolith permission/database helpers.");
}

for (const searchDocumentHelper of [
  "apps/admin/lib/admin/location-data-projections.ts",
  "apps/admin/lib/location-profile-fields.ts",
]) {
  const source = read(searchDocumentHelper);
  if (source.includes("@/lib/")) {
    throw new Error(`Search-document helper must remain self-contained: ${searchDocumentHelper}`);
  }
}

const workerOperationsPage = read("apps/admin/app/admin/dashboard/operations/workers/page.tsx");
if (
  !workerOperationsPage.includes("@theouthaven/auth/admin-session") ||
  !workerOperationsPage.includes("@theouthaven/db/admin-client") ||
  !workerOperationsPage.includes('requireAdminRole(["superadmin", "admin", "experience_team"])')
) {
  throw new Error("Worker Operations page must use isolated Admin auth/shared DB with preserved view roles.");
}
if (
  workerOperationsPage.includes("@/lib/supabase-admin") ||
  workerOperationsPage.includes("@/lib/admin-auth") ||
  workerOperationsPage.includes("@/lib/admin-permissions")
) {
  throw new Error("Worker Operations page must not import root monolith auth/database modules.");
}

for (const workerRuntimeFile of [
  "apps/admin/lib/workers/catalog.ts",
  "apps/admin/lib/workers/operationsMetrics.ts",
  "apps/admin/lib/workers/enqueue.ts",
]) {
  const source = read(workerRuntimeFile);
  if (source.includes("@/lib/supabase-admin")) {
    throw new Error(`Worker Operations runtime must not import root Supabase admin: ${workerRuntimeFile}`);
  }
}
if (!read("apps/admin/lib/workers/enqueue.ts").includes("@theouthaven/db/admin-client")) {
  throw new Error("Worker enqueue runtime must use shared Admin DB package.");
}

const workerJobsRoute = read("apps/admin/app/api/admin/workers/jobs/route.ts");
if (
  !workerJobsRoute.includes("@/lib/admin-api-auth") ||
  !workerJobsRoute.includes("@theouthaven/db/admin-client") ||
  !workerJobsRoute.includes("@/lib/workers/enqueue")
) {
  throw new Error("Worker jobs API must use isolated Admin API auth, shared DB, and local enqueue runtime.");
}
if (workerJobsRoute.includes("supabaseAdmin")) {
  throw new Error("Worker jobs API must not reference the root Supabase admin client.");
}
if (
  !workerJobsRoute.includes('["superadmin", "admin", "experience_team"]') ||
  !workerJobsRoute.includes('["superadmin"]')
) {
  throw new Error("Worker jobs API must preserve read roles and superadmin-only enqueue.");
}

for (const workerMutationRoute of [
  "apps/admin/app/api/admin/workers/jobs/[id]/retry/route.ts",
  "apps/admin/app/api/admin/workers/jobs/[id]/cancel/route.ts",
]) {
  const source = read(workerMutationRoute);
  if (
    !source.includes("@/lib/admin-api-auth") ||
    !source.includes("@theouthaven/db/admin-client") ||
    !source.includes('["superadmin"]')
  ) {
    throw new Error(`Worker mutation route must remain isolated and superadmin-only: ${workerMutationRoute}`);
  }
  if (
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/admin-permissions")
  ) {
    throw new Error(`Worker mutation route must not import root monolith modules: ${workerMutationRoute}`);
  }
}

const searchBenchmarkPage = read("apps/admin/app/admin/dashboard/search-benchmark/page.tsx");
if (
  !searchBenchmarkPage.includes("@theouthaven/auth/admin-session") ||
  !searchBenchmarkPage.includes('requireAdminRole(["superadmin", "admin", "experience_team"])')
) {
  throw new Error("Search Benchmark page must preserve isolated search-health role access.");
}
if (
  searchBenchmarkPage.includes("@/lib/admin-auth") ||
  searchBenchmarkPage.includes("@/components/admin/")
) {
  throw new Error("Search Benchmark page must not import root Admin auth/design-system modules.");
}

for (const searchBenchmarkClient of [
  "apps/admin/app/admin/dashboard/search-benchmark/SearchBenchmarkClient.tsx",
  "apps/admin/app/admin/dashboard/search-benchmark/SearchRankingRolloutClient.tsx",
  "apps/admin/app/admin/dashboard/search-benchmark/SearchRankingShadowValidationClient.tsx",
]) {
  const source = read(searchBenchmarkClient);
  if (source.includes("@/lib/") || source.includes("@/components/admin/")) {
    throw new Error(`Search Benchmark client must remain self-contained: ${searchBenchmarkClient}`);
  }
}

for (const searchBenchmarkDbRoute of [
  "apps/admin/app/api/admin/search-benchmark/labels/route.ts",
  "apps/admin/app/api/admin/search-ranking-rollout/route.ts",
  "apps/admin/app/api/admin/search-ranking-shadow-reviews/route.ts",
]) {
  const source = read(searchBenchmarkDbRoute);
  if (
    !source.includes("@/lib/admin-api-auth") ||
    !source.includes("@theouthaven/db/admin-client") ||
    !source.includes('["superadmin", "admin", "experience_team"]')
  ) {
    throw new Error(`Search Benchmark DB route must use isolated auth/shared DB and preserve search-health roles: ${searchBenchmarkDbRoute}`);
  }
  if (
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/admin-permissions")
  ) {
    throw new Error(`Search Benchmark DB route must not import root monolith auth/database modules: ${searchBenchmarkDbRoute}`);
  }
}

const searchBenchmarkRunRoute = read("apps/admin/app/api/admin/search-benchmark/run/route.ts");
if (
  !searchBenchmarkRunRoute.includes("@/lib/admin-api-auth") ||
  !searchBenchmarkRunRoute.includes("THEOUTHAVEN_CONSUMER_ORIGIN") ||
  !searchBenchmarkRunRoute.includes('headers.set("cookie", cookie)') ||
  !searchBenchmarkRunRoute.includes("/api/admin/search-benchmark/run")
) {
  throw new Error("Search Benchmark run route must use authenticated consumer-surface proxying.");
}
if (
  searchBenchmarkRunRoute.includes("@/lib/search/runSearch") ||
  searchBenchmarkRunRoute.includes("runOutingSearch")
) {
  throw new Error("Search Benchmark must not copy the consumer search engine into the isolated Admin runtime.");
}

const searchBenchmarkProjections = read("apps/admin/lib/admin/search-security-projections.ts");
if (searchBenchmarkProjections.includes("@/lib/")) {
  throw new Error("Search Benchmark security projections must remain self-contained.");
}

const isolatedRankingRollout = read("apps/admin/lib/search/rankingRollout.ts");
if (
  !isolatedRankingRollout.includes("@theouthaven/db/admin-client") ||
  isolatedRankingRollout.includes("@/lib/supabase-admin")
) {
  throw new Error("Isolated ranking rollout helper must use shared Admin DB access.");
}

const settingsHubPage = read("apps/admin/app/admin/dashboard/settings/page.tsx");
if (
  !settingsHubPage.includes("@theouthaven/auth/admin-session") ||
  !settingsHubPage.includes("@theouthaven/db/admin-client")
) {
  throw new Error("Settings hub must use isolated Admin auth and shared DB.");
}
if (
  settingsHubPage.includes("@/lib/supabase-admin") ||
  settingsHubPage.includes("@/lib/admin-auth")
) {
  throw new Error("Settings hub must not import root monolith auth/database modules.");
}

for (const settingsClient of [
  "SearchLimitsClient.tsx",
  "SearchMaintenanceClient.tsx",
  "AiTagHelperSettingsClient.tsx",
  "SearchMlRolloutClient.tsx",
  "SearchProfileRolloutClient.tsx",
  "SearchCoreRolloutClient.tsx",
  "AdminAppearanceSettings.tsx",
]) {
  const source = read(`apps/admin/app/admin/dashboard/settings/${settingsClient}`);
  if (source.includes("@/lib/supabase") || source.includes("@/lib/admin-auth")) {
    throw new Error(`Settings client must remain isolated: ${settingsClient}`);
  }
}

if (!adminNavigation.includes('href: "/admin/dashboard/settings"')) {
  throw new Error("Settings hub navigation must be present in isolated Admin.");
}
if (
  adminNavigation.includes('label: "Settings"') &&
  !adminNavigation.includes('href: "/admin/dashboard/settings", icon: Settings, migrated: true')
) {
  throw new Error("Settings hub navigation must be marked migrated.");
}

const teamSettingsPage = read("apps/admin/app/admin/dashboard/team/settings/page.tsx");
if (
  !teamSettingsPage.includes("@theouthaven/auth/admin-session") ||
  !teamSettingsPage.includes('requireAdminRole(["superadmin", "admin", "manager"])')
) {
  throw new Error("Team Settings page must preserve isolated superadmin/admin/manager access.");
}
if (
  teamSettingsPage.includes("@/lib/admin-auth") ||
  teamSettingsPage.includes("@/lib/admin-permissions")
) {
  throw new Error("Team Settings page must not import root monolith auth/permission modules.");
}

const claimCodeAuditPage = read("apps/admin/app/admin/dashboard/team/claim-code-audit/page.tsx");
if (
  !claimCodeAuditPage.includes("@theouthaven/auth/admin-session") ||
  !claimCodeAuditPage.includes("@theouthaven/db/admin-client") ||
  !claimCodeAuditPage.includes("@/components/TeamReviewList") ||
  !claimCodeAuditPage.includes('requireAdminRole(["superadmin", "admin"])')
) {
  throw new Error("Claim Code Audit must use isolated admin auth, shared DB, and Team review UI.");
}
if (
  claimCodeAuditPage.includes("@/lib/admin-auth") ||
  claimCodeAuditPage.includes("@/lib/admin-permissions") ||
  claimCodeAuditPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Claim Code Audit must not import root monolith auth/database modules.");
}

const teamReviewRoute = read("apps/admin/app/api/admin/team/review-item/route.ts");
if (
  !teamReviewRoute.includes("@theouthaven/auth/admin-session") ||
  !teamReviewRoute.includes("@theouthaven/db/admin-client") ||
  !teamReviewRoute.includes('requireAdminRole(["superadmin", "admin", "manager"])')
) {
  throw new Error("Team review API must preserve isolated team-management access.");
}
for (const requiredTable of [
  "claim_code_audit_logs",
  "password_reset_audit_logs",
  "workspace_escalations",
  "location_change_requests",
  "team_work_sessions",
]) {
  if (!teamReviewRoute.includes(requiredTable)) {
    throw new Error(`Team review API must preserve review table: ${requiredTable}`);
  }
}
if (
  !teamReviewRoute.includes('"approve"') ||
  !teamReviewRoute.includes('"reject"')
) {
  throw new Error("Team review API must remain restricted to approve/reject actions.");
}
if (
  teamReviewRoute.includes("@/lib/admin-api-auth") ||
  teamReviewRoute.includes("@/lib/admin-permissions") ||
  teamReviewRoute.includes("@/lib/supabase-admin")
) {
  throw new Error("Team review API must not import root monolith auth/database modules.");
}

const teamReviewList = read("apps/admin/components/TeamReviewList.tsx");
const teamReviewActionButton = read("apps/admin/components/TeamReviewActionButton.tsx");
if (!teamReviewList.includes("./TeamReviewActionButton")) {
  throw new Error("Team review list must use isolated review action button.");
}
if (!teamReviewActionButton.includes("/api/admin/team/review-item")) {
  throw new Error("Team review action button must call the isolated review API.");
}

const completedSearchProfilesPage = read("apps/admin/app/admin/dashboard/settings/location-tools/search-profiles/completed/page.tsx");
if (
  !completedSearchProfilesPage.includes("@theouthaven/auth/admin-session") ||
  !completedSearchProfilesPage.includes("@theouthaven/db/admin-client") ||
  !completedSearchProfilesPage.includes('requireAdminRole(["superadmin", "admin"])')
) {
  throw new Error("Completed Search Profiles page must use isolated Admin auth and shared DB.");
}
if (
  completedSearchProfilesPage.includes("@/lib/admin-auth") ||
  completedSearchProfilesPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Completed Search Profiles page must not import root monolith auth/database helpers.");
}

const completedReviewCenterPage = read("apps/admin/app/admin/dashboard/settings/location-tools/search-profiles/completed/review-center/page.tsx");
if (
  !completedReviewCenterPage.includes("@theouthaven/auth/admin-session") ||
  !completedReviewCenterPage.includes("@theouthaven/db/admin-client") ||
  !completedReviewCenterPage.includes('requireAdminRole(["superadmin", "admin"])')
) {
  throw new Error("Completed Review Center page must use isolated Admin auth and shared DB.");
}
if (
  completedReviewCenterPage.includes("@/lib/admin-auth") ||
  completedReviewCenterPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Completed Review Center page must not import root monolith auth/database helpers.");
}

const searchProfileRunPage = read("apps/admin/app/admin/dashboard/settings/location-tools/search-profiles/runs/[runId]/page.tsx");
if (
  !searchProfileRunPage.includes("@theouthaven/auth/admin-session") ||
  !searchProfileRunPage.includes("@theouthaven/db/admin-client") ||
  !searchProfileRunPage.includes("@/components/admin/location-tools/ProfileRunActions") ||
  !searchProfileRunPage.includes("@/components/admin/location-tools/ProfileRunLiveRefresh")
) {
  throw new Error("Search Profile run page must use isolated Admin auth/DB and local run clients.");
}
if (
  searchProfileRunPage.includes("@/lib/admin-auth") ||
  searchProfileRunPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Search Profile run page must not import root monolith auth/database helpers.");
}

const searchProfileRunRepository = read("apps/admin/lib/search/profile/profileRunRepository.ts");
if (
  !searchProfileRunRepository.includes("@theouthaven/db/admin-client") ||
  searchProfileRunRepository.includes("@/lib/supabase-admin")
) {
  throw new Error("Search Profile run repository must use the shared Admin DB package.");
}

for (const runActionRoute of [
  "apps/admin/app/api/admin/location-tools/search-profiles/runs/[runId]/cancel/route.ts",
  "apps/admin/app/api/admin/location-tools/search-profiles/runs/[runId]/resume/route.ts",
  "apps/admin/app/api/admin/location-tools/search-profiles/runs/[runId]/retry-failed/route.ts",
]) {
  const source = read(runActionRoute);
  if (
    !source.includes("@theouthaven/auth/admin-session") ||
    !source.includes("@/lib/search/profile/profileRunRepository") ||
    !source.includes("getCurrentAdminOrNull")
  ) {
    throw new Error(`Search Profile run action must use isolated API auth and repository: ${runActionRoute}`);
  }
  if (
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Search Profile run action must not import root monolith helpers: ${runActionRoute}`);
  }
}

const searchProfileDetailPage = read("apps/admin/app/admin/dashboard/settings/location-tools/search-profiles/[locationId]/page.tsx");
if (
  !searchProfileDetailPage.includes("@theouthaven/auth/admin-session") ||
  !searchProfileDetailPage.includes("@theouthaven/db/admin-client") ||
  !searchProfileDetailPage.includes("@/components/admin/location-tools/SearchProfileReviewForm")
) {
  throw new Error("Search Profile detail page must use isolated Admin auth/DB and local review form.");
}
if (
  searchProfileDetailPage.includes("@/lib/admin-auth") ||
  searchProfileDetailPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Search Profile detail page must not import root monolith auth/database helpers.");
}

const searchProfileRepository = read("apps/admin/lib/search/profile/profileRepository.ts");
if (
  !searchProfileRepository.includes("@theouthaven/db/admin-client") ||
  searchProfileRepository.includes("@/lib/supabase-admin")
) {
  throw new Error("Search Profile repository must use the shared Admin DB package.");
}

for (const searchProfileRuntimeFile of [
  "apps/admin/lib/search/v2/taxonomy/index.ts",
  "apps/admin/lib/search/profile/profileTypes.ts",
  "apps/admin/lib/search/profile/profileEvidence.ts",
  "apps/admin/lib/search/profile/profileHash.ts",
  "apps/admin/lib/search/profile/profileClassificationSanitizer.ts",
  "apps/admin/lib/search/profile/validateLocationSearchProfile.ts",
  "apps/admin/lib/search/profile/mealPeriodEvidence.ts",
  "apps/admin/lib/search/profile/providerCategoryEvidence.ts",
  "apps/admin/lib/search/profile/buildLocationSearchProfile.ts",
]) {
  const source = read(searchProfileRuntimeFile);
  if (
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-api-auth")
  ) {
    throw new Error(`Search Profile rebuild runtime must not import root Admin/database helpers: ${searchProfileRuntimeFile}`);
  }
}

for (const searchProfileDetailRoute of [
  "apps/admin/app/api/admin/location-tools/search-profiles/[locationId]/review/route.ts",
  "apps/admin/app/api/admin/location-tools/search-profiles/[locationId]/rebuild/route.ts",
]) {
  const source = read(searchProfileDetailRoute);
  if (
    !source.includes("@theouthaven/auth/admin-session") ||
    !source.includes("@/lib/search/profile/profileRepository") ||
    !source.includes("getCurrentAdminOrNull")
  ) {
    throw new Error(`Search Profile detail action must use isolated API auth and rebuild runtime: ${searchProfileDetailRoute}`);
  }
  if (
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Search Profile detail action must not import root monolith helpers: ${searchProfileDetailRoute}`);
  }
}

const credentialsVaultPage = read("apps/admin/app/admin/dashboard/credentials/page.tsx");
if (
  !credentialsVaultPage.includes("@theouthaven/auth/admin-session") ||
  !credentialsVaultPage.includes('requireAdminRole(["superadmin"])')
) {
  throw new Error("Credentials Vault page must use isolated superadmin auth.");
}
if (credentialsVaultPage.includes("@/lib/admin-auth")) {
  throw new Error("Credentials Vault page must not import root Admin auth.");
}

const credentialsVaultApi = read("apps/admin/app/api/admin/settings/credentials/route.ts");
if (
  !credentialsVaultApi.includes("@theouthaven/auth/admin-session") ||
  !credentialsVaultApi.includes("@/lib/admin-audit-log") ||
  !credentialsVaultApi.includes("@/lib/aws/admin-credential-vault") ||
  !credentialsVaultApi.includes("@/lib/admin/credential-runtime-inventory")
) {
  throw new Error("Credentials Vault API must use isolated Admin auth, audit, runtime inventory, and vault helpers.");
}
if (
  credentialsVaultApi.includes("@/lib/admin-api-auth") ||
  credentialsVaultApi.includes("@/lib/supabase-admin")
) {
  throw new Error("Credentials Vault API must not import root API auth/database modules.");
}

for (const credentialRuntimeFile of [
  "apps/admin/lib/admin/credential-vault-catalog.ts",
  "apps/admin/lib/admin/credential-runtime-inventory.ts",
  "apps/admin/lib/aws/admin-credential-vault.ts",
  "apps/admin/lib/marketing/social-secrets.ts",
  "apps/admin/lib/marketing/social-provider-config.ts",
  "apps/admin/lib/marketing/platform-instagram-oauth.ts",
]) {
  const source = read(credentialRuntimeFile);
  if (source.includes("@/lib/supabase-admin")) {
    throw new Error(`Credentials runtime must not import root Supabase admin: ${credentialRuntimeFile}`);
  }
}

const instagramCredentialStart = read("apps/admin/app/api/admin/settings/credentials/instagram/route.ts");
const instagramCredentialCallback = read("apps/admin/app/api/admin/settings/credentials/instagram/callback/route.ts");
for (const source of [instagramCredentialStart, instagramCredentialCallback]) {
  if (
    !source.includes("@theouthaven/auth/admin-session") ||
    source.includes("@/lib/admin-api-auth")
  ) {
    throw new Error("Credentials Instagram OAuth routes must use isolated Admin auth.");
  }
}
if (
  !read("apps/admin/lib/marketing/platform-instagram-oauth.ts").includes("https://admin.theouthaven.com")
) {
  throw new Error("Credentials Instagram OAuth runtime must default to the Admin host.");
}
if (!adminNavigation.includes("/admin/dashboard/credentials")) {
  throw new Error("Credentials Vault navigation must be present in the isolated Admin shell.");
}

const eventsExperiencesPage = read("apps/admin/app/admin/dashboard/events-experiences/page.tsx");
if (
  !eventsExperiencesPage.includes("@theouthaven/auth/admin-session") ||
  !eventsExperiencesPage.includes("@theouthaven/db/admin-client") ||
  !eventsExperiencesPage.includes('requireAdminRole(["superadmin", "admin", "editor"])')
) {
  throw new Error("Events & Experiences page must use isolated Admin auth/shared DB and preserve event roles.");
}
if (
  eventsExperiencesPage.includes("@/lib/admin-auth") ||
  eventsExperiencesPage.includes("@/lib/admin-permissions") ||
  eventsExperiencesPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Events & Experiences page must not import root monolith auth/database helpers.");
}
if (!adminNavigation.includes("/admin/dashboard/events-experiences")) {
  throw new Error("Events & Experiences navigation must be present in the isolated Admin shell.");
}

const productionCi = read(".github/workflows/production-ci.yml");
if (productionCi.includes("tsconfig.*\\.json|\\.github/workflows/production-ci\\.yml")) {
  throw new Error("Production CI must not classify root tsconfig/workflow-only changes as every regression domain.");
}
if (!productionCi.includes("apps/admin/") || !productionCi.includes("packages/(auth|db|config)/")) {
  throw new Error("Production CI must route isolated Admin/auth/db/config changes through the security regression lane.");
}
if (!productionCi.includes("Detect quality scope") || !productionCi.includes("Lint isolated Admin surface")) {
  throw new Error("Production CI must keep the targeted isolated Admin quality lane.");
}
if (!productionCi.includes("grep -Evq '^(apps/admin/|packages/(auth|db|config)/|scripts/surface-app-isolation-regression\\.mjs$)'")) {
  throw new Error("Production CI must reserve the fast quality lane for isolated Admin/shared-boundary changes only.");
}

const surfaceIsolationWorkflow = read(".github/workflows/surface-app-isolation-foundation.yml");
if (!surfaceIsolationWorkflow.includes("Detect surface scope")) {
  throw new Error("Surface isolation workflow must target builds to changed surfaces.");
}
if (!surfaceIsolationWorkflow.includes("No changes require the")) {
  throw new Error("Surface isolation workflow must preserve successful skipped-surface jobs.");
}
if (!surfaceIsolationWorkflow.includes("apps/\\${SURFACE}/") && !surfaceIsolationWorkflow.includes('^apps/${SURFACE}/')) {
  throw new Error("Surface isolation workflow must detect per-surface app changes.");
}

const rootTsconfig = JSON.parse(read("tsconfig.json"));
for (const excluded of ["apps", "packages"]) {
  if (!rootTsconfig.exclude?.includes(excluded)) {
    throw new Error(`Root consumer tsconfig must exclude isolated monorepo boundary: ${excluded}`);
  }
}

const pkg = JSON.parse(read("package.json"));
for (const surface of surfaces) {
  const key = `build:surface:${surface}`;
  if (pkg.scripts?.[key] !== `next build apps/${surface}`) {
    throw new Error(`Missing independent build script: ${key}`);
  }
}
if (pkg.scripts?.["lint:surface:admin"] !== "eslint apps/admin packages/auth packages/db packages/config") {
  throw new Error("Missing targeted Admin surface lint script.");
}

console.log("Surface app isolation, shared packages, and Admin auth regression passed.");
