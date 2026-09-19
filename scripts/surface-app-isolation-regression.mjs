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
if (!adminLogin.includes("cursor-pointer") || !adminLogin.includes("Sign in with Microsoft")) {
  throw new Error("Admin login must render an unmistakably interactive Microsoft sign-in control.");
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

if (
  adminCallback.includes("microsoft_365_connections") ||
  adminCallback.includes("/api/admin/integrations/microsoft-365/connect")
) {
  throw new Error("Admin login must not require the optional Microsoft 365 Graph connection.");
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

const teamTasksPage = read("apps/admin/app/admin/dashboard/team/tasks/page.tsx");
const workspaceListPage = read("apps/admin/components/WorkspaceListPage.tsx");
if (
  !teamTasksPage.includes("@theouthaven/auth/admin-session") ||
  !teamTasksPage.includes("@theouthaven/db/admin-client") ||
  !teamTasksPage.includes("@/components/WorkspaceListPage") ||
  !teamTasksPage.includes('requireAdminRole(["superadmin", "admin", "manager"])') ||
  !teamTasksPage.includes('from("workspace_tasks")')
) {
  throw new Error("Team Tasks must use isolated team-management auth, shared DB, and workspace list UI.");
}
for (const source of [teamTasksPage, workspaceListPage]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/team-tools")
  ) {
    throw new Error("Team Tasks slice must not import root monolith auth/database/team-tools modules.");
  }
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

const passwordResetAuditPage = read("apps/admin/app/admin/dashboard/team/password-reset-audit/page.tsx");
if (
  !passwordResetAuditPage.includes("@theouthaven/auth/admin-session") ||
  !passwordResetAuditPage.includes("@theouthaven/db/admin-client") ||
  !passwordResetAuditPage.includes("@/components/TeamReviewList") ||
  !passwordResetAuditPage.includes('requireAdminRole(["superadmin", "admin"])')
) {
  throw new Error("Password Reset Audit must use isolated admin auth, shared DB, and Team review UI.");
}
if (
  passwordResetAuditPage.includes("@/lib/admin-auth") ||
  passwordResetAuditPage.includes("@/lib/admin-permissions") ||
  passwordResetAuditPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Password Reset Audit must not import root monolith auth/database modules.");
}

const teamMembersPage = read("apps/admin/app/admin/dashboard/team/members/page.tsx");
if (
  !teamMembersPage.includes("@theouthaven/auth/admin-session") ||
  !teamMembersPage.includes("@theouthaven/db/admin-client") ||
  !teamMembersPage.includes("@/components/TeamToolsForms") ||
  !teamMembersPage.includes('requireAdminRole(["superadmin"])')
) {
  throw new Error("Team Members page must use isolated superadmin auth, shared DB, and local form UI.");
}
if (
  teamMembersPage.includes("@/lib/admin-auth") ||
  teamMembersPage.includes("@/lib/admin-permissions") ||
  teamMembersPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Team Members page must not import root monolith auth/database modules.");
}

const teamMembersApi = read("apps/admin/app/api/admin/team/members/route.ts");
if (
  !teamMembersApi.includes("@theouthaven/auth/admin-session") ||
  !teamMembersApi.includes("@theouthaven/db/admin-client") ||
  !teamMembersApi.includes('requireAdminRole(["superadmin"])')
) {
  throw new Error("Team Members API must use isolated superadmin auth and shared DB.");
}
if (
  teamMembersApi.includes("@/lib/admin-api-auth") ||
  teamMembersApi.includes("@/lib/admin-permissions") ||
  teamMembersApi.includes("@/lib/supabase-admin")
) {
  throw new Error("Team Members API must not import root monolith auth/database modules.");
}

const teamToolsForms = read("apps/admin/components/TeamToolsForms.tsx");
if (!teamToolsForms.includes("/api/admin/team/members")) {
  throw new Error("Team Members form must call the isolated Team Members API.");
}

const teamAssignmentsPage = read("apps/admin/app/admin/dashboard/team/assignments/page.tsx");
if (
  !teamAssignmentsPage.includes("@theouthaven/auth/admin-session") ||
  !teamAssignmentsPage.includes("@/components/AdminAssignLocationsClient") ||
  !teamAssignmentsPage.includes("@/lib/team-assignment-query-safe") ||
  !teamAssignmentsPage.includes("@/lib/team-assignment-members") ||
  !teamAssignmentsPage.includes('requireAdminRole(["superadmin", "admin", "manager"])')
) {
  throw new Error("Team Assignments page must use isolated auth, local runtime, and local assignment client.");
}
if (
  teamAssignmentsPage.includes("@/lib/admin-auth") ||
  teamAssignmentsPage.includes("@/lib/supabase-admin") ||
  teamAssignmentsPage.includes("@/lib/team-tools")
) {
  throw new Error("Team Assignments page must not import root monolith auth/database/team helpers.");
}

for (const assignmentRoute of [
  "apps/admin/app/api/admin/workspace/assign-locations/route.ts",
  "apps/admin/app/api/admin/workspace/assign-locations/search/route.ts",
]) {
  const source = read(assignmentRoute);
  if (
    !source.includes("@theouthaven/auth/admin-session") ||
    !source.includes('requireAdminRole(["superadmin", "admin", "manager"])')
  ) {
    throw new Error(`Team Assignment route must preserve isolated manager access: ${assignmentRoute}`);
  }
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Team Assignment route must not import root auth/database helpers: ${assignmentRoute}`);
  }
}

for (const assignmentRuntime of [
  "apps/admin/lib/team-assignment-members.ts",
  "apps/admin/lib/team-assignment-query-safe.ts",
  "apps/admin/lib/team-assignment-service.ts",
]) {
  const source = read(assignmentRuntime);
  if (
    !source.includes("@theouthaven/db/admin-client") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Team Assignment runtime must use shared Admin DB access: ${assignmentRuntime}`);
  }
}

const assignmentClient = read("apps/admin/components/AdminAssignLocationsClient.tsx");
if (
  !assignmentClient.includes("/api/admin/workspace/assign-locations") ||
  !assignmentClient.includes("/api/admin/workspace/assign-locations/search")
) {
  throw new Error("Team Assignment client must use isolated assignment APIs.");
}

const teamWorkSessionsPage = read("apps/admin/app/admin/dashboard/team/work-sessions/page.tsx");
if (
  !teamWorkSessionsPage.includes("@theouthaven/auth/admin-session") ||
  !teamWorkSessionsPage.includes("@theouthaven/db/admin-client") ||
  !teamWorkSessionsPage.includes("@/components/TeamToolsForms") ||
  !teamWorkSessionsPage.includes('requireAdminRole(["superadmin", "admin", "manager"])')
) {
  throw new Error("Work Sessions page must use isolated manager auth, shared DB, and local review UI.");
}
if (
  teamWorkSessionsPage.includes("@/lib/admin-auth") ||
  teamWorkSessionsPage.includes("@/lib/admin-permissions") ||
  teamWorkSessionsPage.includes("@/lib/supabase-admin") ||
  teamWorkSessionsPage.includes("@/lib/team-tools")
) {
  throw new Error("Work Sessions page must not import root monolith auth/database/team helpers.");
}

const teamWorkSessionsApi = read("apps/admin/app/api/admin/team/work-sessions/route.ts");
if (
  !teamWorkSessionsApi.includes("@theouthaven/auth/admin-session") ||
  !teamWorkSessionsApi.includes("@theouthaven/db/admin-client") ||
  !teamWorkSessionsApi.includes('requireAdminRole(["superadmin", "admin", "manager"])')
) {
  throw new Error("Work Sessions API must use isolated manager auth and shared DB.");
}
if (
  teamWorkSessionsApi.includes("@/lib/admin-api-auth") ||
  teamWorkSessionsApi.includes("@/lib/admin-permissions") ||
  teamWorkSessionsApi.includes("@/lib/supabase-admin")
) {
  throw new Error("Work Sessions API must not import root monolith auth/database helpers.");
}

const managerReviewPage = read("apps/admin/app/admin/dashboard/team/review/page.tsx");
if (
  !managerReviewPage.includes("@theouthaven/auth/admin-session") ||
  !managerReviewPage.includes("@theouthaven/db/admin-client") ||
  !managerReviewPage.includes("@/components/TeamReviewList") ||
  !managerReviewPage.includes('requireAdminRole(["superadmin", "admin", "manager"])')
) {
  throw new Error("Manager Review page must use isolated manager auth, shared DB, and Team review UI.");
}
if (
  managerReviewPage.includes("@/lib/admin-auth") ||
  managerReviewPage.includes("@/lib/admin-permissions") ||
  managerReviewPage.includes("@/lib/supabase-admin") ||
  managerReviewPage.includes("@/components/WorkspaceListPage")
) {
  throw new Error("Manager Review page must not import root monolith auth/database/UI helpers.");
}
for (const reviewTable of [
  "team_work_sessions",
  "location_change_requests",
  "team_proofs",
  "ambassador_site_visits",
  "ambassador_social_outreach",
]) {
  if (!managerReviewPage.includes(reviewTable)) {
    throw new Error(`Manager Review must preserve review queue: ${reviewTable}`);
  }
}

const teamSiteVisitsPage = read("apps/admin/app/admin/dashboard/team/site-visits/page.tsx");
if (
  !teamSiteVisitsPage.includes("@theouthaven/auth/admin-session") ||
  !teamSiteVisitsPage.includes("@theouthaven/db/admin-client") ||
  !teamSiteVisitsPage.includes('requireAdminRole(["superadmin", "admin", "manager"])') ||
  !teamSiteVisitsPage.includes("ambassador_site_visits")
) {
  throw new Error("Site Visits page must use isolated manager auth/shared DB and preserve visit data.");
}
if (
  teamSiteVisitsPage.includes("@/lib/admin-auth") ||
  teamSiteVisitsPage.includes("@/lib/admin-permissions") ||
  teamSiteVisitsPage.includes("@/lib/supabase-admin") ||
  teamSiteVisitsPage.includes("@/lib/team-tools")
) {
  throw new Error("Site Visits page must not import root monolith auth/database/team helpers.");
}

const teamSocialOutreachPage = read("apps/admin/app/admin/dashboard/team/social-outreach/page.tsx");
if (
  !teamSocialOutreachPage.includes("@theouthaven/auth/admin-session") ||
  !teamSocialOutreachPage.includes("@theouthaven/db/admin-client") ||
  !teamSocialOutreachPage.includes('requireAdminRole(["superadmin", "admin", "manager"])') ||
  !teamSocialOutreachPage.includes("ambassador_social_outreach") ||
  !teamSocialOutreachPage.includes("social_outreach_templates")
) {
  throw new Error("Social Outreach page must use isolated manager auth/shared DB and preserve outreach/template data.");
}
if (
  teamSocialOutreachPage.includes("@/lib/admin-auth") ||
  teamSocialOutreachPage.includes("@/lib/admin-permissions") ||
  teamSocialOutreachPage.includes("@/lib/supabase-admin") ||
  teamSocialOutreachPage.includes("@/lib/team-tools")
) {
  throw new Error("Social Outreach page must not import root monolith auth/database/team helpers.");
}

const teamSupportWorkPage = read("apps/admin/app/admin/dashboard/team/support-work/page.tsx");
if (
  !teamSupportWorkPage.includes("@theouthaven/auth/admin-session") ||
  !teamSupportWorkPage.includes("@theouthaven/db/admin-client") ||
  !teamSupportWorkPage.includes('requireAdminRole(["superadmin", "admin", "experience_team", "viewer"])') ||
  !teamSupportWorkPage.includes("team_work_activities") ||
  !teamSupportWorkPage.includes('"support_ticket"')
) {
  throw new Error("Support Work page must use isolated experience inbox auth/shared DB and preserve support activity data.");
}
if (
  teamSupportWorkPage.includes("@/lib/admin-auth") ||
  teamSupportWorkPage.includes("@/lib/admin-permissions") ||
  teamSupportWorkPage.includes("@/lib/supabase-admin") ||
  teamSupportWorkPage.includes("@/lib/team-tools")
) {
  throw new Error("Support Work page must not import root monolith auth/database/team helpers.");
}

const locationChangeRequestsPage = read("apps/admin/app/admin/dashboard/team/location-change-requests/page.tsx");
if (
  !locationChangeRequestsPage.includes("@theouthaven/auth/admin-session") ||
  !locationChangeRequestsPage.includes("@theouthaven/db/admin-client") ||
  !locationChangeRequestsPage.includes("@/components/TeamReviewList") ||
  !locationChangeRequestsPage.includes('requireAdminRole(["superadmin", "admin", "manager"])') ||
  !locationChangeRequestsPage.includes("location_change_requests")
) {
  throw new Error("Location Change Requests must use isolated manager auth, shared DB, and Team review UI.");
}
if (
  locationChangeRequestsPage.includes("@/lib/admin-auth") ||
  locationChangeRequestsPage.includes("@/lib/admin-permissions") ||
  locationChangeRequestsPage.includes("@/lib/supabase-admin") ||
  locationChangeRequestsPage.includes("@/components/WorkspaceListPage")
) {
  throw new Error("Location Change Requests must not import root monolith auth/database/UI helpers.");
}

const teamPayrollPage = read("apps/admin/app/admin/dashboard/team/payroll/page.tsx");
if (
  !teamPayrollPage.includes("@theouthaven/auth/admin-session") ||
  !teamPayrollPage.includes("@theouthaven/db/admin-client") ||
  !teamPayrollPage.includes('requireAdminRole(["superadmin", "admin"])') ||
  !teamPayrollPage.includes("team_work_sessions") ||
  !teamPayrollPage.includes("team_payroll_batches")
) {
  throw new Error("Payroll page must use isolated security-audit auth/shared DB and preserve payroll data.");
}
if (
  teamPayrollPage.includes("@/lib/admin-auth") ||
  teamPayrollPage.includes("@/lib/admin-permissions") ||
  teamPayrollPage.includes("@/lib/supabase-admin") ||
  teamPayrollPage.includes("@/lib/team-tools")
) {
  throw new Error("Payroll page must not import root monolith auth/database/team helpers.");
}

const teamPerformancePage = read("apps/admin/app/admin/dashboard/team/performance/page.tsx");
if (
  !teamPerformancePage.includes("@theouthaven/auth/admin-session") ||
  !teamPerformancePage.includes("@theouthaven/db/admin-client") ||
  !teamPerformancePage.includes('requireAdminRole(["superadmin", "admin", "manager"])')
) {
  throw new Error("Performance page must use isolated manager auth and shared DB.");
}
for (const performanceSource of [
  "team_work_sessions",
  "team_work_activities",
  "ambassador_site_visits",
  "ambassador_social_outreach",
]) {
  if (!teamPerformancePage.includes(performanceSource)) {
    throw new Error(`Performance page must preserve data source: ${performanceSource}`);
  }
}
if (
  teamPerformancePage.includes("@/lib/admin-auth") ||
  teamPerformancePage.includes("@/lib/admin-permissions") ||
  teamPerformancePage.includes("@/lib/supabase-admin") ||
  teamPerformancePage.includes("@/lib/team-tools")
) {
  throw new Error("Performance page must not import root monolith auth/database/team helpers.");
}

const teamProofReviewPage = read("apps/admin/app/admin/dashboard/team/proof-review/page.tsx");
if (
  !teamProofReviewPage.includes("@theouthaven/auth/admin-session") ||
  !teamProofReviewPage.includes("@theouthaven/db/admin-client") ||
  !teamProofReviewPage.includes('requireAdminRole(["superadmin", "admin", "manager"])') ||
  !teamProofReviewPage.includes("team_proofs")
) {
  throw new Error("Proof Review page must use isolated manager auth/shared DB and preserve proof data.");
}
if (
  teamProofReviewPage.includes("@/lib/admin-auth") ||
  teamProofReviewPage.includes("@/lib/admin-permissions") ||
  teamProofReviewPage.includes("@/lib/supabase-admin") ||
  teamProofReviewPage.includes("@/lib/team-tools")
) {
  throw new Error("Proof Review page must not import root monolith auth/database/team helpers.");
}

const teamHubPage = read("apps/admin/app/admin/dashboard/team/page.tsx");
const teamWorkspaceRuntime = read("apps/admin/lib/team-workspace.ts");
const teamWorkspaceClient = read("apps/admin/components/TeamWorkSessionClient.tsx");
const teamWorkspaceApi = read("apps/admin/app/api/team/work-session/route.ts");
if (
  !teamHubPage.includes("@theouthaven/auth/admin-session") ||
  !teamHubPage.includes("@theouthaven/db/admin-client") ||
  !teamHubPage.includes("@/lib/team-workspace") ||
  !teamHubPage.includes("@/components/TeamWorkSessionClient")
) {
  throw new Error("Team Tools hub must use isolated auth, DB, workspace runtime, and client.");
}
for (const source of [teamHubPage, teamWorkspaceRuntime, teamWorkspaceApi]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/team-tools")
  ) {
    throw new Error("Team Tools hub slice must not import root monolith auth/database/team helpers.");
  }
}
if (
  !teamWorkspaceRuntime.includes("getAdminDatabaseClient") ||
  !teamWorkspaceRuntime.includes("getCurrentAdmin") ||
  !teamWorkspaceApi.includes("/admin/dashboard/team/work-sessions") ||
  !teamWorkspaceClient.includes("/api/team/work-session")
) {
  throw new Error("Team Tools workspace runtime/client/API boundary is incomplete.");
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

const experiencesPage = read("apps/admin/app/admin/dashboard/experiences/page.tsx");
if (
  !experiencesPage.includes("@theouthaven/auth/admin-session") ||
  !experiencesPage.includes("@theouthaven/db/admin-client") ||
  !experiencesPage.includes('requireAdminRole(["superadmin", "admin", "editor"])')
) {
  throw new Error("Experiences page must use isolated Admin auth/shared DB and preserve event roles.");
}
if (
  experiencesPage.includes("@/lib/admin-auth") ||
  experiencesPage.includes("@/lib/admin-permissions") ||
  experiencesPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Experiences page must not import root monolith auth/database helpers.");
}
if (
  !experiencesPage.includes('process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com"') ||
  !experiencesPage.includes('href={`${consumerOrigin}/experiences`}') ||
  !experiencesPage.includes('href={`${consumerOrigin}/experiences/${row.id}`}')
) {
  throw new Error("Experiences public links must remain on the consumer surface.");
}

const eventsPage = read("apps/admin/app/admin/dashboard/events/page.tsx");
const eventsActions = read("apps/admin/app/admin/dashboard/events/actions.ts");
if (
  !eventsPage.includes("@theouthaven/auth/admin-session") ||
  !eventsPage.includes("@theouthaven/db/admin-client") ||
  !eventsPage.includes('requireAdminRole(["superadmin", "admin", "editor"])')
) {
  throw new Error("Events page must use isolated Admin auth/shared DB and preserve event roles.");
}
if (
  eventsPage.includes("@/lib/admin-auth") ||
  eventsPage.includes("@/lib/admin-permissions") ||
  eventsPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Events page must not import root monolith auth/database helpers.");
}
if (
  !eventsPage.includes('href={`${consumerOrigin}/events`}') ||
  !eventsPage.includes('href={`${consumerOrigin}/organizers/dashboard`}') ||
  !eventsPage.includes('href={`${consumerOrigin}/events/${event.id}`}')
) {
  throw new Error("Events public links must remain on the consumer surface.");
}
if (
  !eventsActions.includes("@theouthaven/auth/admin-session") ||
  !eventsActions.includes("@theouthaven/db/admin-client") ||
  !eventsActions.includes('requireAdminRole(["superadmin", "admin", "editor"])')
) {
  throw new Error("Events actions must use isolated Admin auth/shared DB and preserve management roles.");
}
if (
  eventsActions.includes("@/lib/admin-auth") ||
  eventsActions.includes("@/lib/admin-permissions") ||
  eventsActions.includes("@/lib/supabase-admin")
) {
  throw new Error("Events actions must not import root monolith auth/database helpers.");
}

const smsOperationsPage = read("apps/admin/app/admin/dashboard/sms/page.tsx");
if (
  !smsOperationsPage.includes("@theouthaven/auth/admin-session") ||
  !smsOperationsPage.includes("@theouthaven/db/admin-client") ||
  !smsOperationsPage.includes('requireAdminRole(["superadmin", "admin", "ambassador", "experience_team", "viewer"])')
) {
  throw new Error("SMS Operations page must use isolated Admin auth/shared DB and preserve SMS roles.");
}
if (
  smsOperationsPage.includes("@/lib/admin-auth") ||
  smsOperationsPage.includes("@/lib/admin-permissions") ||
  smsOperationsPage.includes("@/lib/supabase-admin")
) {
  throw new Error("SMS Operations page must not import root monolith auth/database helpers.");
}

const campaignsPage = read("apps/admin/app/admin/dashboard/campaigns/page.tsx");
if (
  !campaignsPage.includes("@theouthaven/auth/admin-session") ||
  !campaignsPage.includes("@theouthaven/db/admin-client") ||
  !campaignsPage.includes("@/lib/admin/formatters") ||
  !campaignsPage.includes('requireAdminRole(["superadmin","admin","editor","viewer","marketing_intern","marketing_specialist","marketing_manager"])')
) {
  throw new Error("Campaigns page must use isolated Admin auth/shared DB and preserve campaign roles.");
}
if (
  campaignsPage.includes("@/lib/admin-auth") ||
  campaignsPage.includes("@/lib/admin-permissions") ||
  campaignsPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Campaigns page must not import root monolith auth/database helpers.");
}

const careersPage = read("apps/admin/app/admin/dashboard/careers/page.tsx");
if (
  !careersPage.includes("@theouthaven/auth/admin-session") ||
  !careersPage.includes("@theouthaven/db/admin-client") ||
  !careersPage.includes('"superadmin"') ||
  !careersPage.includes('"admin"') ||
  !careersPage.includes('"manager"') ||
  !careersPage.includes('"editor"') ||
  !careersPage.includes('"reviewer"') ||
  !careersPage.includes('"ambassador"') ||
  !careersPage.includes('"experience_team"') ||
  !careersPage.includes('"viewer"')
) {
  throw new Error("Careers hub must use isolated Admin auth/shared DB and preserve core staff access.");
}
if (
  careersPage.includes("@/lib/admin-auth") ||
  careersPage.includes("@/lib/admin-permissions") ||
  careersPage.includes("@/lib/supabase-admin") ||
  careersPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Careers hub must not import root monolith auth/database/UI helpers.");
}
if (
  !careersPage.includes('from("career_jobs")') ||
  !careersPage.includes('from("career_applications")') ||
  !careersPage.includes('from("career_interviews")') ||
  !careersPage.includes('from("career_offers")')
) {
  throw new Error("Careers hub must preserve hiring dashboard data sources.");
}

const careersJobsPage = read("apps/admin/app/admin/dashboard/careers/jobs/page.tsx");
const careersAccess = read("apps/admin/lib/careers/access.ts");
const careersFormat = read("apps/admin/lib/careers/format.ts");
if (
  !careersJobsPage.includes("@theouthaven/auth/admin-session") ||
  !careersJobsPage.includes("@theouthaven/db/admin-client") ||
  !careersJobsPage.includes("@/lib/careers/access") ||
  !careersJobsPage.includes("@/lib/careers/format")
) {
  throw new Error("Careers Jobs Manager must use isolated Admin auth/shared DB and isolated careers helpers.");
}
for (const source of [careersJobsPage, careersAccess, careersFormat]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/components/admin/AdminDesignSystem")
  ) {
    throw new Error("Careers Jobs slice must not import root monolith auth/database/UI helpers.");
  }
}
if (
  !careersJobsPage.includes('from("career_jobs")') ||
  !careersJobsPage.includes('from("career_applications")') ||
  !careersJobsPage.includes('process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com"')
) {
  throw new Error("Careers Jobs Manager must preserve job/application reads and consumer-surface previews.");
}

const careersApplicationsPage = read("apps/admin/app/admin/dashboard/careers/applications/page.tsx");
if (
  !careersApplicationsPage.includes("@theouthaven/auth/admin-session") ||
  !careersApplicationsPage.includes("@theouthaven/db/admin-client") ||
  !careersApplicationsPage.includes("@/lib/careers/access") ||
  !careersApplicationsPage.includes("@/lib/careers/format")
) {
  throw new Error("Careers Applications Manager must use isolated Admin auth/shared DB and careers helpers.");
}
if (
  careersApplicationsPage.includes("@/lib/admin-auth") ||
  careersApplicationsPage.includes("@/lib/admin-permissions") ||
  careersApplicationsPage.includes("@/lib/supabase-admin") ||
  careersApplicationsPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Careers Applications Manager must not import root monolith auth/database/UI helpers.");
}
if (
  !careersApplicationsPage.includes('from("career_applications")') ||
  !careersApplicationsPage.includes('href={`/admin/dashboard/careers/applications/${row.id}`}')
) {
  throw new Error("Careers Applications Manager must preserve application reads and detail links.");
}

const careersPipelinePage = read("apps/admin/app/admin/dashboard/careers/pipeline/page.tsx");
if (
  !careersPipelinePage.includes("@theouthaven/auth/admin-session") ||
  !careersPipelinePage.includes("@theouthaven/db/admin-client") ||
  !careersPipelinePage.includes("@/lib/careers/access") ||
  !careersPipelinePage.includes("@/lib/careers/format")
) {
  throw new Error("Careers Pipeline must use isolated Admin auth/shared DB and careers helpers.");
}
if (
  careersPipelinePage.includes("@/lib/admin-auth") ||
  careersPipelinePage.includes("@/lib/admin-permissions") ||
  careersPipelinePage.includes("@/lib/supabase-admin") ||
  careersPipelinePage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Careers Pipeline must not import root monolith auth/database/UI helpers.");
}
if (
  !careersPipelinePage.includes('from("career_applications")') ||
  !careersPipelinePage.includes('"interview_requested"') ||
  !careersPipelinePage.includes('"offer_pending"') ||
  !careersPipelinePage.includes('"talent_pool"')
) {
  throw new Error("Careers Pipeline must preserve application stage workflow data.");
}

const careersInterviewsPage = read("apps/admin/app/admin/dashboard/careers/interviews/page.tsx");
if (
  !careersInterviewsPage.includes("@theouthaven/auth/admin-session") ||
  !careersInterviewsPage.includes("@theouthaven/db/admin-client") ||
  !careersInterviewsPage.includes("@/lib/careers/access") ||
  !careersInterviewsPage.includes("@/lib/careers/format") ||
  !careersInterviewsPage.includes('from("career_interviews")')
) {
  throw new Error("Careers Interviews must use isolated Admin auth/shared DB and careers helpers.");
}
if (
  careersInterviewsPage.includes("@/lib/admin-auth") ||
  careersInterviewsPage.includes("@/lib/admin-permissions") ||
  careersInterviewsPage.includes("@/lib/supabase-admin") ||
  careersInterviewsPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Careers Interviews must not import root monolith auth/database/UI helpers.");
}

const careersOffersPage = read("apps/admin/app/admin/dashboard/careers/offers/page.tsx");
if (
  !careersOffersPage.includes("@theouthaven/auth/admin-session") ||
  !careersOffersPage.includes("@theouthaven/db/admin-client") ||
  !careersOffersPage.includes("@/lib/careers/access") ||
  !careersOffersPage.includes("@/lib/careers/format") ||
  !careersOffersPage.includes('from("career_offers")')
) {
  throw new Error("Careers Offers must use isolated Admin auth/shared DB and careers helpers.");
}
if (
  careersOffersPage.includes("@/lib/admin-auth") ||
  careersOffersPage.includes("@/lib/admin-permissions") ||
  careersOffersPage.includes("@/lib/supabase-admin") ||
  careersOffersPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Careers Offers must not import root monolith auth/database/UI helpers.");
}

const careersTalentPoolPage = read("apps/admin/app/admin/dashboard/careers/talent-pool/page.tsx");
if (
  !careersTalentPoolPage.includes("@theouthaven/auth/admin-session") ||
  !careersTalentPoolPage.includes("@theouthaven/db/admin-client") ||
  !careersTalentPoolPage.includes("@/lib/careers/access") ||
  !careersTalentPoolPage.includes("@/lib/careers/format") ||
  !careersTalentPoolPage.includes('from("career_talent_pool")')
) {
  throw new Error("Careers Talent Pool must use isolated Admin auth/shared DB and careers helpers.");
}
if (
  careersTalentPoolPage.includes("@/lib/admin-auth") ||
  careersTalentPoolPage.includes("@/lib/admin-permissions") ||
  careersTalentPoolPage.includes("@/lib/supabase-admin") ||
  careersTalentPoolPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Careers Talent Pool must not import root monolith auth/database/UI helpers.");
}

const careersInternshipsPage = read("apps/admin/app/admin/dashboard/careers/internships/page.tsx");
if (
  !careersInternshipsPage.includes("@theouthaven/auth/admin-session") ||
  !careersInternshipsPage.includes("@theouthaven/db/admin-client") ||
  !careersInternshipsPage.includes("@/lib/careers/access") ||
  !careersInternshipsPage.includes("@/lib/careers/format") ||
  !careersInternshipsPage.includes('from("career_internship_programs")')
) {
  throw new Error("Careers Internships must use isolated Admin auth/shared DB and careers helpers.");
}
if (
  careersInternshipsPage.includes("@/lib/admin-auth") ||
  careersInternshipsPage.includes("@/lib/admin-permissions") ||
  careersInternshipsPage.includes("@/lib/supabase-admin") ||
  careersInternshipsPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Careers Internships must not import root monolith auth/database/UI helpers.");
}

const careersTeamConversionPage = read("apps/admin/app/admin/dashboard/careers/team-conversion/page.tsx");
const careersMicrosoftReadinessClient = read("apps/admin/app/admin/dashboard/careers/team-conversion/MicrosoftReadinessCheck.tsx");
const careersMicrosoftReadinessRoute = read("apps/admin/app/api/admin/careers/team-conversion/microsoft-readiness/route.ts");
if (
  !careersTeamConversionPage.includes("@theouthaven/auth/admin-session") ||
  !careersTeamConversionPage.includes("@theouthaven/db/admin-client") ||
  !careersTeamConversionPage.includes("@/lib/careers/format") ||
  !careersTeamConversionPage.includes('requireAdminRole(["superadmin", "admin"])') ||
  !careersTeamConversionPage.includes('from("career_team_conversions")')
) {
  throw new Error("Careers Team Conversion must use isolated Admin auth/shared DB and preserve employee conversion access.");
}
for (const source of [careersTeamConversionPage, careersMicrosoftReadinessClient, careersMicrosoftReadinessRoute]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/components/admin/AdminDesignSystem")
  ) {
    throw new Error("Careers Team Conversion slice must not import root monolith auth/database/UI helpers.");
  }
}
if (!careersMicrosoftReadinessClient.includes("/api/admin/careers/team-conversion/microsoft-readiness")) {
  throw new Error("Careers Team Conversion readiness client must call the isolated Admin API.");
}
if (
  !careersMicrosoftReadinessRoute.includes("@theouthaven/auth/admin-session") ||
  !careersMicrosoftReadinessRoute.includes("@theouthaven/db/admin-client") ||
  !careersMicrosoftReadinessRoute.includes("getCurrentAdminOrNull") ||
  !careersMicrosoftReadinessRoute.includes('"career-microsoft-readiness"')
) {
  throw new Error("Careers Microsoft readiness API must use isolated auth/shared DB and preserve Edge Function invocation.");
}

const careersMarketingPage = read("apps/admin/app/admin/dashboard/careers/marketing/page.tsx");
if (
  !careersMarketingPage.includes("@theouthaven/auth/admin-session") ||
  !careersMarketingPage.includes("@theouthaven/db/admin-client") ||
  !careersMarketingPage.includes("@/lib/careers/access") ||
  !careersMarketingPage.includes("@/lib/careers/format") ||
  !careersMarketingPage.includes('from("career_content_tests")')
) {
  throw new Error("Careers Marketing must use isolated Admin auth/shared DB and careers helpers.");
}
if (
  careersMarketingPage.includes("@/lib/admin-auth") ||
  careersMarketingPage.includes("@/lib/admin-permissions") ||
  careersMarketingPage.includes("@/lib/supabase-admin") ||
  careersMarketingPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Careers Marketing must not import root monolith auth/database/UI helpers.");
}

const careersSettingsPage = read("apps/admin/app/admin/dashboard/careers/settings/page.tsx");
if (
  !careersSettingsPage.includes("@theouthaven/auth/admin-session") ||
  !careersSettingsPage.includes("@theouthaven/db/admin-client") ||
  !careersSettingsPage.includes("@/lib/careers/access") ||
  !careersSettingsPage.includes("@/lib/careers/format") ||
  !careersSettingsPage.includes('from("career_email_events")')
) {
  throw new Error("Careers Settings must use isolated Admin auth/shared DB and careers helpers.");
}
if (
  careersSettingsPage.includes("@/lib/admin-auth") ||
  careersSettingsPage.includes("@/lib/admin-permissions") ||
  careersSettingsPage.includes("@/lib/supabase-admin") ||
  careersSettingsPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Careers Settings must not import root monolith auth/database/UI helpers.");
}

const claimsRedirectPage = read("apps/admin/app/admin/dashboard/claims/page.tsx");
if (
  !claimsRedirectPage.includes('redirect("/admin/dashboard/crm/locations?view=pending-claims")') ||
  claimsRedirectPage.includes("@/lib/")
) {
  throw new Error("Legacy Claims route must remain an isolated redirect to the pending-claims CRM view.");
}

const mlDashboardPage = read("apps/admin/app/admin/dashboard/ml/page.tsx");
const mlActions = read("apps/admin/components/admin/ml/MlRecalculationActions.tsx");
const mlLocationRoute = read("apps/admin/app/api/admin/ml/recalculate-location-scores/route.ts");
const mlPhase2Route = read("apps/admin/app/api/admin/ml/recalculate-phase2/route.ts");
const mlReviewRoute = read("apps/admin/app/api/admin/ml/recalculate-review-intelligence/route.ts");
const mlAdvancedRoute = read("apps/admin/app/api/admin/ml/recalculate-advanced-all/route.ts");
const mlAuth = read("apps/admin/lib/ml/admin-ml-auth.ts");
const mlAdvancedRuntime = read("apps/admin/lib/ml/advanced/recalculate.ts");

if (
  !mlDashboardPage.includes("@theouthaven/auth/admin-session") ||
  !mlDashboardPage.includes("@theouthaven/db/admin-client") ||
  !mlDashboardPage.includes("@/components/admin/ml/MlRecalculationActions") ||
  !mlDashboardPage.includes('from("location_ml_features")') ||
  !mlDashboardPage.includes('from("location_intent_ml_features")') ||
  !mlDashboardPage.includes('from("location_pair_ml_features")') ||
  !mlDashboardPage.includes('from("location_review_ml_features")')
) {
  throw new Error("Machine Learning dashboard must use isolated Admin auth/shared DB and preserve ML data reads.");
}
for (const source of [mlDashboardPage, mlLocationRoute, mlPhase2Route, mlReviewRoute, mlAdvancedRoute, mlAuth, mlAdvancedRuntime]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/components/admin/AdminDesignSystem")
  ) {
    throw new Error("Machine Learning slice must not import root monolith auth/database/UI helpers.");
  }
}
if (
  !mlActions.includes("/api/admin/ml/recalculate-location-scores") ||
  !mlActions.includes("/api/admin/ml/recalculate-phase2") ||
  !mlActions.includes("/api/admin/ml/recalculate-review-intelligence")
) {
  throw new Error("Machine Learning recalculation client must preserve protected recalculation endpoints.");
}
if (
  !mlLocationRoute.includes("@theouthaven/db/admin-client") ||
  !mlLocationRoute.includes("@/lib/ml/admin-ml-auth") ||
  !mlPhase2Route.includes("@theouthaven/db/admin-client") ||
  !mlPhase2Route.includes("@/lib/ml/admin-ml-auth") ||
  !mlReviewRoute.includes("@theouthaven/db/admin-client") ||
  !mlReviewRoute.includes("@/lib/ml/admin-ml-auth") ||
  !mlAdvancedRoute.includes("@/lib/ml/admin-ml-auth") ||
  !mlAdvancedRuntime.includes("@theouthaven/db/admin-client")
) {
  throw new Error("Machine Learning recalculation runtime must use isolated auth and shared Admin DB.");
}

const websiteHostingPage = read("apps/admin/app/admin/dashboard/website-hosting/page.tsx");
const websiteHostingTabs = read("apps/admin/components/admin/WebsiteHostingTabs.tsx");
if (
  !websiteHostingPage.includes("@theouthaven/auth/admin-session") ||
  !websiteHostingPage.includes("@theouthaven/auth/admin-roles") ||
  !websiteHostingPage.includes("@theouthaven/db/admin-client") ||
  !websiteHostingPage.includes("@/components/admin/WebsiteHostingTabs") ||
  !websiteHostingPage.includes('from("website_hosting_nodes")') ||
  !websiteHostingPage.includes('from("business_websites")')
) {
  throw new Error("Website Hosting overview must use isolated Admin auth/shared DB and preserve hosting telemetry reads.");
}
if (
  websiteHostingPage.includes("@/lib/admin-auth") ||
  websiteHostingPage.includes("@/lib/admin-permissions") ||
  websiteHostingPage.includes("@/lib/supabase-admin") ||
  websiteHostingPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Website Hosting overview must not import root monolith auth/database/UI helpers.");
}
if (
  !websiteHostingTabs.includes("/admin/dashboard/website-hosting/migrations") ||
  !websiteHostingTabs.includes("/admin/dashboard/website-hosting/verification") ||
  !websiteHostingTabs.includes("/admin/dashboard/website-hosting/testing")
) {
  throw new Error("Website Hosting tabs must preserve operations navigation.");
}

const websiteMigrationsPage = read("apps/admin/app/admin/dashboard/website-hosting/migrations/page.tsx");
if (
  !websiteMigrationsPage.includes("@theouthaven/auth/admin-session") ||
  !websiteMigrationsPage.includes("@theouthaven/auth/admin-roles") ||
  !websiteMigrationsPage.includes("@theouthaven/db/admin-client") ||
  !websiteMigrationsPage.includes("@/components/admin/WebsiteHostingTabs") ||
  !websiteMigrationsPage.includes('from("business_websites")')
) {
  throw new Error("Website Hosting migrations must use isolated Admin auth/shared DB and preserve business website migration reads.");
}
if (
  websiteMigrationsPage.includes("@/lib/admin-auth") ||
  websiteMigrationsPage.includes("@/lib/admin-permissions") ||
  websiteMigrationsPage.includes("@/lib/supabase-admin") ||
  websiteMigrationsPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Website Hosting migrations must not import root monolith auth/database/UI helpers.");
}
if (
  !websiteMigrationsPage.includes("website_import") ||
  !websiteMigrationsPage.includes("dns_stalled") ||
  !websiteMigrationsPage.includes("ssl_stalled") ||
  !websiteMigrationsPage.includes("health_stale")
) {
  throw new Error("Website Hosting migrations must preserve import, domain, and live-health state tracking.");
}

const websiteVerificationPage = read("apps/admin/app/admin/dashboard/website-hosting/verification/page.tsx");
const websiteVerificationRuntime = read("apps/admin/lib/websites/production-verification.ts");
const domainGatewayRuntime = read("apps/admin/lib/domains/gateway.ts");
const websiteCompositionProfiles = read("apps/admin/lib/websites/composition-profiles.ts");
const websiteDesignDirections = read("apps/admin/lib/websites/design-directions.ts");

if (
  !websiteVerificationPage.includes("@theouthaven/auth/admin-session") ||
  !websiteVerificationPage.includes("@theouthaven/auth/admin-roles") ||
  !websiteVerificationPage.includes("@/components/admin/WebsiteHostingTabs") ||
  !websiteVerificationPage.includes("@/lib/domains/gateway") ||
  !websiteVerificationPage.includes("@/lib/websites/production-verification") ||
  !websiteVerificationPage.includes("@/lib/websites/composition-profiles") ||
  !websiteVerificationPage.includes("@/lib/websites/design-directions")
) {
  throw new Error("Website Hosting verification must use isolated Admin auth and isolated website/domain runtimes.");
}
for (const source of [websiteVerificationPage, websiteVerificationRuntime, domainGatewayRuntime]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/components/admin/AdminDesignSystem")
  ) {
    throw new Error("Website Hosting verification must not import root monolith auth/database/UI helpers.");
  }
}
if (
  !websiteVerificationRuntime.includes("@theouthaven/db/admin-client") ||
  !websiteVerificationRuntime.includes('from("business_websites")') ||
  !websiteVerificationRuntime.includes('from("website_hosting_nodes")') ||
  !websiteVerificationRuntime.includes('from("website_hosting_replicas")')
) {
  throw new Error("Website production verification must preserve hosted-site, node, and replica checks through the shared Admin DB.");
}
if (
  !domainGatewayRuntime.includes("/v1/status") ||
  !websiteVerificationPage.includes("WEBSITE_DESIGN_DIRECTIONS.length >= 40") ||
  !websiteCompositionProfiles.includes("WEBSITE_COMPOSITION_PROFILES") ||
  !websiteDesignDirections.includes("WEBSITE_DESIGN_DIRECTIONS")
) {
  throw new Error("Website Hosting verification must preserve registrar readiness and 40-family design coverage checks.");
}

const websiteTestingPage = read("apps/admin/app/admin/dashboard/website-hosting/testing/page.tsx");
const websiteDrPanel = read("apps/admin/components/admin/HostingDrTestPanel.tsx");
const websiteDrRoute = read("apps/admin/app/api/admin/hosting/dr-test/route.ts");
const websiteLiveDrillRoute = read("apps/admin/app/api/admin/hosting/live-drill/route.ts");
const websiteDrSimulation = read("apps/admin/lib/hosting/dr-simulation.ts");
const websiteWildcardFailover = read("apps/admin/lib/domains/vercel-wildcard-failover.ts");
const websiteLightsailFailover = read("apps/admin/lib/hosting/lightsail-failover.ts");
const websiteMutationLease = read("apps/admin/lib/hosting/website-mutation-lease.ts");
const websiteReplication = read("apps/admin/lib/hosting/website-replication.ts");

if (
  !websiteTestingPage.includes("@theouthaven/auth/admin-session") ||
  !websiteTestingPage.includes("@/components/admin/HostingDrTestPanel") ||
  !websiteTestingPage.includes('requireAdminRole(["superadmin", "admin"])')
) {
  throw new Error("Website Hosting testing must preserve protected isolated Admin access and DR panel.");
}
if (
  !websiteDrPanel.includes("/api/admin/hosting/dr-test") ||
  !websiteDrPanel.includes("/api/admin/hosting/live-drill") ||
  !websiteDrPanel.includes("LIVE DR THEOUTHAVEN LOUNGE")
) {
  throw new Error("Website Hosting DR panel must preserve simulation and guarded live-drill endpoints.");
}
for (const source of [
  websiteTestingPage,
  websiteDrRoute,
  websiteLiveDrillRoute,
  websiteDrSimulation,
  websiteWildcardFailover,
  websiteLightsailFailover,
  websiteMutationLease,
  websiteReplication,
]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/components/admin/AdminDesignSystem")
  ) {
    throw new Error("Website Hosting testing slice must not import root monolith auth/database/UI helpers.");
  }
}
if (
  !websiteDrRoute.includes("@theouthaven/auth/admin-session") ||
  !websiteDrRoute.includes("@theouthaven/db/admin-client") ||
  !websiteDrRoute.includes("@/lib/hosting/dr-simulation") ||
  !websiteLiveDrillRoute.includes("@theouthaven/auth/admin-session") ||
  !websiteLiveDrillRoute.includes("@theouthaven/db/admin-client") ||
  !websiteLiveDrillRoute.includes("@/lib/domains/vercel-wildcard-failover") ||
  !websiteLiveDrillRoute.includes("@/lib/hosting/lightsail-failover") ||
  !websiteLiveDrillRoute.includes("@/lib/hosting/website-mutation-lease") ||
  !websiteLiveDrillRoute.includes("@/lib/hosting/website-replication")
) {
  throw new Error("Website Hosting DR APIs must preserve isolated auth, shared DB, and failover dependencies.");
}
if (
  !websiteDrSimulation.includes("@theouthaven/db/admin-client") ||
  !websiteWildcardFailover.includes("@theouthaven/db/admin-client") ||
  !websiteLightsailFailover.includes("@theouthaven/db/admin-client") ||
  !websiteMutationLease.includes("@theouthaven/db/admin-client") ||
  !websiteReplication.includes("@theouthaven/db/admin-client")
) {
  throw new Error("Website Hosting DR runtimes must use the shared Admin DB.");
}

const usersPage = read("apps/admin/app/admin/dashboard/users/page.tsx");
const usersReadRuntime = read("apps/admin/lib/admin/admin-users-read.ts");
const usersCoreApi = read("apps/admin/lib/aws/admin-users-core-api.ts");
const usersBetaControl = read("apps/admin/app/admin/dashboard/users/BetaAccessSelect.tsx");
const usersBetaRoute = read("apps/admin/app/api/admin/users/[userId]/beta-access/route.ts");
const usersBetaRuntime = read("apps/admin/lib/beta/program-access.ts");

if (
  !usersPage.includes("@theouthaven/auth/admin-session") ||
  !usersPage.includes("@theouthaven/db/admin-client") ||
  !usersPage.includes("@/lib/admin/admin-users-read") ||
  !usersPage.includes('requireAdminRole(["superadmin"])') ||
  !usersPage.includes("./BetaAccessSelect")
) {
  throw new Error("Users page must preserve superadmin-only isolated auth, KPIs, read runtime, and beta access control.");
}
for (const source of [usersPage, usersReadRuntime, usersBetaRoute, usersBetaRuntime]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/components/admin/AdminDesignSystem")
  ) {
    throw new Error("Users slice must not import root monolith auth/database/UI helpers.");
  }
}
if (
  !usersReadRuntime.includes("@theouthaven/auth/admin-session") ||
  !usersReadRuntime.includes("@theouthaven/db/admin-client") ||
  !usersReadRuntime.includes("@/lib/aws/admin-users-core-api") ||
  !usersReadRuntime.includes('from("user_profiles")') ||
  !usersReadRuntime.includes('from("beta_testers")') ||
  !usersReadRuntime.includes('from("support_tickets")') ||
  !usersCoreApi.includes("/v1/admin/users/list/read")
) {
  throw new Error("Users read path must preserve shared DB fallback and AWS Core API reads.");
}
if (
  !usersBetaControl.includes("/api/admin/users/") ||
  !usersBetaControl.includes("/beta-access") ||
  !usersBetaRoute.includes("@theouthaven/auth/admin-session") ||
  !usersBetaRoute.includes("@/lib/beta/program-access") ||
  !usersBetaRoute.includes('admin.role !== "superadmin"')
) {
  throw new Error("Users beta access control must preserve isolated superadmin API authorization.");
}
if (
  !usersBetaRuntime.includes("@theouthaven/db/admin-client") ||
  !usersBetaRuntime.includes('from("beta_testers")') ||
  !usersBetaRuntime.includes('from("beta_applications")') ||
  !usersBetaRuntime.includes('from("launch_waitlist_signups")') ||
  !usersBetaRuntime.includes('from("beta_test_sessions")') ||
  !usersBetaRuntime.includes('from("admin_audit_logs")')
) {
  throw new Error("Users beta access runtime must preserve beta synchronization, weekly session, and audit writes.");
}

const userDetailPage = read("apps/admin/app/admin/dashboard/users/[userId]/page.tsx");
const userDetailActions = read("apps/admin/app/admin/dashboard/users/UserActions.tsx");
const userDetailRuntime = read("apps/admin/lib/admin/admin-user-detail.ts");
const userDetailRoute = read("apps/admin/app/api/admin/users/[userId]/route.ts");
const userPasswordResetRoute = read("apps/admin/app/api/admin/users/[userId]/password-reset/route.ts");
const isolatedUserRoles = read("apps/admin/lib/users/roles.ts");

if (
  !userDetailPage.includes("@theouthaven/auth/admin-session") ||
  !userDetailPage.includes("@/lib/admin/admin-user-detail") ||
  !userDetailPage.includes('requireAdminRole(["superadmin"])') ||
  !userDetailPage.includes("../UserActions")
) {
  throw new Error("User detail page must preserve isolated superadmin auth, detail runtime, and actions.");
}
for (const source of [userDetailPage, userDetailActions, userDetailRuntime, userDetailRoute, userPasswordResetRoute, isolatedUserRoles]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error("User detail slice must not import root monolith auth/database helpers.");
  }
}
if (
  !userDetailRuntime.includes("@theouthaven/db/admin-client") ||
  !userDetailRuntime.includes("@/lib/admin-audit-log") ||
  !userDetailRuntime.includes('from("user_profiles")') ||
  !userDetailRuntime.includes('from("admin_users")') ||
  !userDetailRuntime.includes('from("customer_subscriptions")') ||
  !userDetailRuntime.includes("resetPasswordForEmail")
) {
  throw new Error("User detail runtime must preserve shared DB, audit, subscription, role, and password-reset behavior.");
}
if (
  !userDetailRoute.includes("@/lib/admin-api-auth") ||
  !userDetailRoute.includes('requireAdminApiRole(["superadmin"])') ||
  !userDetailRoute.includes("updateAdminUserProfile") ||
  !userDetailRoute.includes("updateUserRole") ||
  !userDetailRoute.includes("updateUserPlan") ||
  !userDetailRoute.includes("disableAdminUser")
) {
  throw new Error("User detail API must preserve superadmin-only profile, role, plan, and disable actions.");
}
if (
  !userPasswordResetRoute.includes("@/lib/admin-api-auth") ||
  !userPasswordResetRoute.includes('requireAdminApiRole(["superadmin"])') ||
  !userPasswordResetRoute.includes("sendUserPasswordReset") ||
  !userPasswordResetRoute.includes("logAdminAuditEvent")
) {
  throw new Error("User password reset API must preserve isolated superadmin authorization and audit logging.");
}
if (
  !userDetailActions.includes("/api/admin/users/") ||
  !userDetailActions.includes("/password-reset") ||
  !userDetailActions.includes("@/lib/users/roles")
) {
  throw new Error("User detail actions must target isolated Admin APIs and role options.");
}

const ownerAccountsPage = read("apps/admin/app/admin/dashboard/owner-accounts/page.tsx");
if (
  !ownerAccountsPage.includes("@theouthaven/auth/admin-session") ||
  !ownerAccountsPage.includes("@theouthaven/db/admin-client") ||
  !ownerAccountsPage.includes("@/components/admin/ImpersonateButton") ||
  !ownerAccountsPage.includes('requireAdminRole([\n    "superadmin",\n    "admin",\n    "ambassador",\n    "experience_team",\n  ])') ||
  !ownerAccountsPage.includes('/admin/dashboard/users/')
) {
  throw new Error("Owner Accounts must use isolated auth/DB, preserve owner-account roles, and link to isolated user details.");
}
if (
  ownerAccountsPage.includes("@/lib/admin-auth") ||
  ownerAccountsPage.includes("@/lib/admin-permissions") ||
  ownerAccountsPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Owner Accounts must not import root monolith auth/database helpers.");
}
if (
  !ownerAccountsPage.includes('currentAdmin.role === "superadmin"') ||
  !ownerAccountsPage.includes('targetType="user"')
) {
  throw new Error("Owner Accounts impersonation must remain superadmin-only and target user accounts.");
}

const analyticsPage = read("apps/admin/app/admin/dashboard/analytics/page.tsx");
const analyticsRuntime = read("apps/admin/lib/admin/analytics/getAdminSaasAnalytics.ts");
const analyticsCache = read("apps/admin/lib/admin/analytics/getCachedAdminSaasAnalytics.ts");
const analyticsLog = read("apps/admin/lib/admin/logAdminEvent.ts");
const analyticsTabs = read("apps/admin/app/admin/dashboard/analytics/AnalyticsTabs.tsx");

if (
  !analyticsPage.includes("@theouthaven/auth/admin-session") ||
  !analyticsPage.includes("@/lib/admin/analytics/getCachedAdminSaasAnalytics") ||
  !analyticsPage.includes("@/lib/admin/logAdminEvent") ||
  !analyticsPage.includes("@/components/admin/AdminDesignSystem") ||
  !analyticsPage.includes('requireAdminRole(["superadmin", "admin", "manager", "editor", "reviewer", "ambassador", "experience_team", "viewer"])')
) {
  throw new Error("Analytics must use isolated Admin auth/runtime and preserve analytics role access.");
}
for (const source of [analyticsPage, analyticsRuntime, analyticsCache, analyticsLog, analyticsTabs]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error("Analytics slice must not import root monolith auth/database helpers.");
  }
}
if (
  !analyticsRuntime.includes("@theouthaven/db/admin-client") ||
  !analyticsLog.includes("@theouthaven/db/admin-client") ||
  !analyticsCache.includes("unstable_cache")
) {
  throw new Error("Analytics runtime must use shared Admin DB and preserve cached analytics reads.");
}

const plannerAnalyticsPage = read("apps/admin/app/admin/dashboard/analytics/planner/page.tsx");
const plannerAnalyticsRuntime = read("apps/admin/lib/admin/planner-funnel.ts");

if (
  !plannerAnalyticsPage.includes("@theouthaven/auth/admin-session") ||
  !plannerAnalyticsPage.includes("@/lib/admin/planner-funnel") ||
  !plannerAnalyticsPage.includes('requireAdminRole(["superadmin", "admin", "manager", "editor", "reviewer", "ambassador", "experience_team", "viewer"])')
) {
  throw new Error("Planner Analytics must preserve isolated Admin auth, analytics access, and funnel runtime.");
}
for (const source of [plannerAnalyticsPage, plannerAnalyticsRuntime]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error("Planner Analytics slice must not import root monolith auth/database helpers.");
  }
}
if (
  !plannerAnalyticsRuntime.includes("@theouthaven/db/admin-client") ||
  !plannerAnalyticsRuntime.includes('from("analytics_events")') ||
  !plannerAnalyticsRuntime.includes('from("outings")') ||
  !plannerAnalyticsRuntime.includes('from("location_reviews")')
) {
  throw new Error("Planner Analytics runtime must use shared Admin DB and preserve funnel data sources.");
}

const betaAdminPage = read("apps/admin/app/admin/dashboard/beta/page.tsx");
const betaAdminClient = read("apps/admin/app/admin/dashboard/beta/BetaAdminClient.tsx");
const betaSearchLabRedirect = read("apps/admin/app/admin/dashboard/beta/search-lab/page.tsx");
const betaApiShared = read("apps/admin/app/api/admin/beta/_shared.ts");
const betaWeeklyTasks = read("apps/admin/lib/beta/weeklyTasks.ts");
const betaReminderEmails = read("apps/admin/lib/beta/reminderEmails.ts");
const betaProgramAccess = read("apps/admin/lib/beta/program-access.ts");
const betaEmailSend = read("apps/admin/lib/email/send.ts");
const betaApiRoutes = [
  "weekly-settings",
  "weekly-sessions",
  "test-weekly-session",
  "reminders",
  "applications",
  "testers",
  "feedback",
  "bugs",
  "tasks",
].map((name) => read(`apps/admin/app/api/admin/beta/${name}/route.ts`));

if (
  !betaAdminPage.includes("@theouthaven/auth/admin-session") ||
  !betaAdminPage.includes("@theouthaven/db/admin-client") ||
  !betaAdminPage.includes('["superadmin", "admin", "experience_team"]') ||
  !betaAdminClient.includes("/api/admin/beta/weekly-settings") ||
  !betaAdminClient.includes("/api/admin/beta/tasks")
) {
  throw new Error("Beta Admin dashboard must preserve isolated access, shared DB reads, and Admin Beta actions.");
}
if (
  !betaApiShared.includes("@theouthaven/auth/admin-session") ||
  !betaApiShared.includes("@theouthaven/db/admin-client") ||
  !betaWeeklyTasks.includes("@theouthaven/db/admin-client") ||
  !betaReminderEmails.includes("@theouthaven/db/admin-client") ||
  !betaProgramAccess.includes("@theouthaven/db/admin-client")
) {
  throw new Error("Beta Admin runtime must use isolated auth and shared Admin DB.");
}
for (const source of [betaAdminPage, betaApiShared, betaWeeklyTasks, betaReminderEmails, betaProgramAccess, ...betaApiRoutes]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error("Beta Admin slice must not import root monolith auth/database helpers.");
  }
}
if (
  !betaReminderEmails.includes("@/lib/email/send") ||
  !betaEmailSend.includes("@/lib/aws/integration-api") ||
  !betaEmailSend.includes("sendEmailViaIntegrationApi")
) {
  throw new Error("Beta Admin reminders must use the isolated branded email integration path.");
}
if (!betaSearchLabRedirect.includes("/admin/dashboard/search-health")) {
  throw new Error("Beta Search Lab redirect must continue to Search Health.");
}

const legacyBusinessChurnRisk = read("apps/admin/app/admin/dashboard/businesses/churn-risk/page.tsx");
const legacyBusinessCommunicationCenter = read("apps/admin/app/admin/dashboard/businesses/communication-center/page.tsx");
const legacyBusinessFollowups = read("apps/admin/app/admin/dashboard/businesses/followups/page.tsx");

if (!legacyBusinessChurnRisk.includes('/admin/dashboard/crm/operations?view=churn-risk')) {
  throw new Error("Legacy Business churn-risk redirect must preserve CRM operations target.");
}
if (!legacyBusinessCommunicationCenter.includes('/admin/dashboard/crm/operations?view=communication-center')) {
  throw new Error("Legacy Business communication-center redirect must preserve CRM operations target.");
}
if (!legacyBusinessFollowups.includes('/admin/dashboard/crm/work-queue?view=follow-ups')) {
  throw new Error("Legacy Business followups redirect must preserve CRM work-queue target.");
}
for (const source of [legacyBusinessChurnRisk, legacyBusinessCommunicationCenter, legacyBusinessFollowups]) {
  if (
    source.includes("@/lib/routes") ||
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error("Legacy Business redirects must remain self-contained inside isolated Admin.");
  }
}

const businessesPage = read("apps/admin/app/admin/dashboard/businesses/page.tsx");
const businessViewPage = read("apps/admin/app/admin/dashboard/businesses/view/page.tsx");
const businessDetailPage = read("apps/admin/app/admin/dashboard/businesses/[id]/page.tsx");
const businessOutreachPage = read("apps/admin/app/admin/dashboard/businesses/outreach/page.tsx");
const businessUpgradePage = read("apps/admin/app/admin/dashboard/businesses/upgrade-opportunities/page.tsx");
const businessCrmRuntime = read("apps/admin/lib/admin/business-crm.ts");
const businessCommunicationSection = read("apps/admin/components/admin/business/BusinessCommunicationSection.tsx");
const businessImpersonateButton = read("apps/admin/components/admin/ImpersonateButton.tsx");
const businessImpersonateRoute = read("apps/admin/app/api/admin/impersonate/route.ts");

for (const source of [
  businessViewPage,
  businessDetailPage,
  businessOutreachPage,
  businessUpgradePage,
  businessCrmRuntime,
  businessCommunicationSection,
  businessImpersonateRoute,
]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/admin-crm")
  ) {
    throw new Error("Business CRM slice must not import root monolith auth/database/CRM helpers.");
  }
}
if (
  !businessViewPage.includes("@theouthaven/auth/admin-session") ||
  !businessViewPage.includes("@/lib/admin/business-crm") ||
  !businessDetailPage.includes("@theouthaven/db/admin-client") ||
  !businessOutreachPage.includes('requireAdminRole(["superadmin", "admin", "ambassador"])') ||
  !businessUpgradePage.includes('requireAdminRole(["superadmin", "admin", "ambassador"])')
) {
  throw new Error("Business CRM pages must preserve isolated auth, role access, and shared DB reads.");
}
if (
  !businessCrmRuntime.includes("@theouthaven/db/admin-client") ||
  !businessCrmRuntime.includes('"admin_crm_locations_view"') ||
  !businessCrmRuntime.includes('"business_crm_snapshot"') ||
  !businessCrmRuntime.includes('"locations"') ||
  !businessCrmRuntime.includes("getUpgradeFlags")
) {
  throw new Error("Business CRM runtime must preserve CRM fallback sources and upgrade signals.");
}
if (
  !businessImpersonateButton.includes("/api/admin/impersonate") ||
  !businessImpersonateRoute.includes("@/lib/admin-api-auth") ||
  !businessImpersonateRoute.includes("@theouthaven/db/admin-client") ||
  !businessImpersonateRoute.includes('requireAdminApiRole(["superadmin"])')
) {
  throw new Error("Business CRM impersonation must preserve isolated superadmin-only API behavior.");
}
if (
  !businessesPage.includes("/admin/dashboard/businesses/followups") ||
  !businessesPage.includes("/admin/dashboard/businesses/communication-center")
) {
  throw new Error("Business overview tabs must point at the isolated legacy redirect routes.");
}

const careersJobEditPage = read("apps/admin/app/admin/dashboard/careers/jobs/[id]/page.tsx");
const careersJobNewPage = read("apps/admin/app/admin/dashboard/careers/jobs/new/page.tsx");
const careersJobForm = read("apps/admin/components/admin/careers/CareerJobEditForm.tsx");
const careersJobTypes = read("apps/admin/lib/careers/types.ts");
const careersJobCompliance = read("apps/admin/lib/careers/new-york-compliance.ts");
const careersJobsRoute = read("apps/admin/app/api/admin/careers/jobs/route.ts");
const careersJobDetailRoute = read("apps/admin/app/api/admin/careers/jobs/[id]/route.ts");
const careersJobsAiRoute = read("apps/admin/app/api/admin/careers/jobs/ai-helper/route.ts");

for (const source of [
  careersJobEditPage,
  careersJobNewPage,
  careersJobForm,
  careersJobTypes,
  careersJobCompliance,
  careersJobsRoute,
  careersJobDetailRoute,
  careersJobsAiRoute,
]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error("Careers Jobs slice must not import root monolith auth/database helpers.");
  }
}
if (
  !careersJobEditPage.includes("@theouthaven/auth/admin-session") ||
  !careersJobEditPage.includes("@theouthaven/db/admin-client") ||
  !careersJobNewPage.includes("@theouthaven/auth/admin-session") ||
  !careersJobForm.includes("@/lib/careers/new-york-compliance") ||
  !careersJobForm.includes("/api/admin/careers/jobs") ||
  !careersJobForm.includes("/api/admin/careers/jobs/ai-helper")
) {
  throw new Error("Careers Jobs pages/form must preserve isolated auth, shared DB, compliance, and API actions.");
}
for (const source of [careersJobsRoute, careersJobDetailRoute]) {
  if (
    !source.includes("@/lib/admin-api-auth") ||
    !source.includes("@theouthaven/db/admin-client") ||
    !source.includes("@/lib/careers/new-york-compliance")
  ) {
    throw new Error("Careers Jobs APIs must preserve isolated API auth, shared DB, and New York compliance checks.");
  }
}
if (
  !careersJobsAiRoute.includes("@/lib/admin-api-auth") ||
  !careersJobsAiRoute.includes('requireAdminApiRole(["superadmin", "admin", "editor"])') ||
  !careersJobsAiRoute.includes("buildFallbackCareerJobDraft") ||
  !careersJobsAiRoute.includes("OPENAI_API_KEY")
) {
  throw new Error("Careers Jobs AI helper must preserve isolated authorization and deterministic fallback behavior.");
}

const careersInternActivePage = read("apps/admin/app/admin/dashboard/careers/internships/active/page.tsx");
const careersInternAssignmentsPage = read("apps/admin/app/admin/dashboard/careers/internships/assignments/page.tsx");
const careersInternCompliancePage = read("apps/admin/app/admin/dashboard/careers/internships/compliance/page.tsx");

for (const source of [
  careersInternActivePage,
  careersInternAssignmentsPage,
  careersInternCompliancePage,
]) {
  if (
    !source.includes("@theouthaven/auth/admin-session") ||
    !source.includes("@theouthaven/db/admin-client") ||
    !source.includes("@/lib/careers/format") ||
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error("Careers internship pages must preserve isolated auth/shared DB and Careers formatting.");
  }
}
if (
  !careersInternActivePage.includes('from("career_applications")') ||
  !careersInternAssignmentsPage.includes('from("career_internship_assignments")') ||
  !careersInternCompliancePage.includes('from("career_jobs")')
) {
  throw new Error("Careers internship pages must preserve their live CRM data sources.");
}

const careersInternshipActivePage = read("apps/admin/app/admin/dashboard/careers/internships/active/page.tsx");
const careersInternshipAssignmentsPage = read("apps/admin/app/admin/dashboard/careers/internships/assignments/page.tsx");
const careersInternshipCompliancePage = read("apps/admin/app/admin/dashboard/careers/internships/compliance/page.tsx");
for (const source of [careersInternshipActivePage, careersInternshipAssignmentsPage, careersInternshipCompliancePage]) {
  if (
    !source.includes("@theouthaven/auth/admin-session") ||
    !source.includes("@theouthaven/db/admin-client") ||
    !source.includes("@/lib/careers/format") ||
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error("Careers internship pages must use isolated Admin auth/shared DB and existing Careers formatting helpers.");
  }
}
if (!careersInternshipActivePage.includes('from("career_applications")')) throw new Error("Active Interns must preserve career application reads.");
if (!careersInternshipAssignmentsPage.includes('from("career_internship_assignments")')) throw new Error("Internship Assignments must preserve assignment reads.");
if (!careersInternshipCompliancePage.includes('from("career_jobs")')) throw new Error("Internship Compliance must preserve career job compliance reads.");

const teamEscalationsPage = read("apps/admin/app/admin/dashboard/team/escalations/page.tsx");
if (
  !teamEscalationsPage.includes("@theouthaven/auth/admin-session") ||
  !teamEscalationsPage.includes("@theouthaven/db/admin-client") ||
  !teamEscalationsPage.includes("@/components/TeamReviewList") ||
  !teamEscalationsPage.includes('requireAdminRole(["superadmin", "admin", "manager"])') ||
  !teamEscalationsPage.includes('from("workspace_escalations")') ||
  !teamEscalationsPage.includes('table="workspace_escalations"')
) {
  throw new Error("Team Escalations must use isolated Admin auth/shared DB and the isolated review UI.");
}
if (
  teamEscalationsPage.includes("@/lib/admin-auth") ||
  teamEscalationsPage.includes("@/lib/admin-permissions") ||
  teamEscalationsPage.includes("@/lib/supabase-admin") ||
  teamEscalationsPage.includes("@/components/WorkspaceListPage")
) {
  throw new Error("Team Escalations must not import root monolith auth/database/review modules.");
}

const teamDemoPage = read("apps/admin/app/admin/dashboard/team/demo/page.tsx");
if (
  !teamDemoPage.includes("@theouthaven/auth/admin-session") ||
  !teamDemoPage.includes("@theouthaven/db/admin-client") ||
  !teamDemoPage.includes("@/lib/address-utils") ||
  !teamDemoPage.includes('requireAdminRole(["superadmin", "admin", "manager"])') ||
  !teamDemoPage.includes('from("crm_demo_locations")') ||
  !teamDemoPage.includes('from("crm_demo_sessions")')
) {
  throw new Error("Team Demo must use isolated Admin auth/shared DB and preserve demo/training reads.");
}
if (
  teamDemoPage.includes("@/lib/admin-auth") ||
  teamDemoPage.includes("@/lib/admin-permissions") ||
  teamDemoPage.includes("@/lib/supabase-admin") ||
  teamDemoPage.includes("@/lib/team-tools")
) {
  throw new Error("Team Demo must not import root monolith auth/database/team helpers.");
}

const legacyReservationPage = read("apps/admin/app/admin/dashboard/reservation/page.tsx");
if (
  !legacyReservationPage.includes('redirect("/admin/dashboard/reservations?tab=opportunities")') ||
  legacyReservationPage.includes("@/lib/")
) {
  throw new Error("Legacy Reservation route must remain an isolated redirect to Reservations opportunities.");
}

const legacyReservePage = read("apps/admin/app/admin/dashboard/reserve/page.tsx");
if (
  !legacyReservePage.includes('redirect("/admin/dashboard/reservations?tab=floor")') ||
  legacyReservePage.includes("@/lib/")
) {
  throw new Error("Legacy Reserve route must remain an isolated redirect to Reservations floor.");
}

const searchAnchorsPage = read("apps/admin/app/admin/dashboard/search-anchors/page.tsx");
if (
  !searchAnchorsPage.includes("@theouthaven/db/admin-client") ||
  !searchAnchorsPage.includes('from("search_anchors")') ||
  !searchAnchorsPage.includes('from("search_anchor_discoveries")') ||
  !searchAnchorsPage.includes("/admin/dashboard/search-anchors/sync-preview") ||
  !searchAnchorsPage.includes("/admin/dashboard/search-anchors/audit")
) {
  throw new Error("Search Anchors overview must use shared Admin DB and preserve anchor operations links.");
}
if (
  searchAnchorsPage.includes("@/lib/supabase-admin") ||
  searchAnchorsPage.includes("@/lib/admin-auth") ||
  searchAnchorsPage.includes("@/lib/admin-permissions")
) {
  throw new Error("Search Anchors overview must not import root monolith database/auth helpers.");
}

const searchAnchorsLayout = read("apps/admin/app/admin/dashboard/search-anchors/layout.tsx");
if (
  !searchAnchorsLayout.includes("@theouthaven/auth/admin-session") ||
  !searchAnchorsLayout.includes('requireAdminRole(["superadmin", "admin"])')
) {
  throw new Error("Search Anchors layout must preserve data-quality access in the isolated Admin app.");
}
if (
  searchAnchorsLayout.includes("@/lib/admin-auth") ||
  searchAnchorsLayout.includes("@/lib/admin-permissions")
) {
  throw new Error("Search Anchors layout must not import root monolith auth/permission helpers.");
}

const searchAnchorsVerificationPage = read("apps/admin/app/admin/dashboard/search-anchors/verification/page.tsx");
if (
  !searchAnchorsVerificationPage.includes("@theouthaven/db/admin-client") ||
  !searchAnchorsVerificationPage.includes('from("locations")') ||
  !searchAnchorsVerificationPage.includes('from("search_anchors")') ||
  !searchAnchorsVerificationPage.includes('from("search_anchor_reconciliation_queue")') ||
  !searchAnchorsVerificationPage.includes('from("search_anchor_discoveries")')
) {
  throw new Error("Search Anchors verification must use shared Admin DB and preserve verification telemetry reads.");
}
if (
  searchAnchorsVerificationPage.includes("@/lib/supabase-admin") ||
  searchAnchorsVerificationPage.includes("@/lib/admin-auth") ||
  searchAnchorsVerificationPage.includes("@/lib/admin-permissions")
) {
  throw new Error("Search Anchors verification must not import root monolith database/auth helpers.");
}

const searchAnchorsAuditPage = read("apps/admin/app/admin/dashboard/search-anchors/audit/page.tsx");
const searchAnchorsAuditRuntime = read("apps/admin/lib/search/anchors/audit.ts");
if (
  !searchAnchorsAuditPage.includes("@/lib/search/anchors/audit") ||
  !searchAnchorsAuditPage.includes("buildSearchAnchorCoverageAudit") ||
  !searchAnchorsAuditRuntime.includes("@theouthaven/db/admin-client") ||
  !searchAnchorsAuditRuntime.includes('fetchAll("locations")') ||
  !searchAnchorsAuditRuntime.includes('fetchAll("search_anchors")')
) {
  throw new Error("Search Anchors audit must use the isolated audit runtime and shared Admin DB.");
}
if (
  searchAnchorsAuditRuntime.includes("@/lib/supabase-admin") ||
  searchAnchorsAuditPage.includes("@/lib/admin-auth") ||
  searchAnchorsAuditPage.includes("@/lib/admin-permissions")
) {
  throw new Error("Search Anchors audit must not import root monolith database/auth helpers.");
}

const searchAnchorsCuratedReviewPage = read("apps/admin/app/admin/dashboard/search-anchors/curated-review/page.tsx");
const searchAnchorsCuratedReviewClient = read("apps/admin/app/admin/dashboard/search-anchors/curated-review/CuratedReviewClient.tsx");
const searchAnchorsCuratedReviewRoute = read("apps/admin/app/api/admin/search-anchors/curated-review/route.ts");
if (
  !searchAnchorsCuratedReviewPage.includes("@theouthaven/db/admin-client") ||
  !searchAnchorsCuratedReviewPage.includes('from("search_anchors")') ||
  !searchAnchorsCuratedReviewClient.includes("/api/admin/search-anchors/curated-review") ||
  !searchAnchorsCuratedReviewRoute.includes("@theouthaven/auth/admin-session") ||
  !searchAnchorsCuratedReviewRoute.includes("@theouthaven/db/admin-client") ||
  !searchAnchorsCuratedReviewRoute.includes('new Set(["superadmin", "admin", "manager"])')
) {
  throw new Error("Search Anchors curated review must use isolated Admin DB/auth and preserve review workflow.");
}
for (const source of [searchAnchorsCuratedReviewPage, searchAnchorsCuratedReviewRoute]) {
  if (
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-permissions")
  ) {
    throw new Error("Search Anchors curated review must not import root monolith auth/database helpers.");
  }
}

const searchAnchorsOperationsPage = read("apps/admin/app/admin/dashboard/search-anchors/operations/page.tsx");
const searchAnchorsOperationsClient = read("apps/admin/app/admin/dashboard/search-anchors/operations/SearchAnchorOperationsControls.tsx");
const searchAnchorsReconciliationRoute = read("apps/admin/app/api/admin/search-anchors/reconciliation/route.ts");
if (
  !searchAnchorsOperationsPage.includes("@theouthaven/db/admin-client") ||
  !searchAnchorsOperationsPage.includes('from("search_anchor_reconciliation_queue")') ||
  !searchAnchorsOperationsClient.includes("/api/admin/search-anchors/reconciliation") ||
  !searchAnchorsReconciliationRoute.includes("@theouthaven/auth/admin-session") ||
  !searchAnchorsReconciliationRoute.includes("@theouthaven/db/admin-client") ||
  !searchAnchorsReconciliationRoute.includes('new Set(["superadmin", "admin", "manager"])') ||
  !searchAnchorsReconciliationRoute.includes("/api/cron/search-anchor-reconciliation")
) {
  throw new Error("Search Anchors operations must use isolated Admin auth/shared DB and preserve reconciliation actions.");
}
for (const source of [searchAnchorsOperationsPage, searchAnchorsReconciliationRoute]) {
  if (
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-permissions")
  ) {
    throw new Error("Search Anchors operations must not import root monolith auth/database helpers.");
  }
}

const searchAnchorOperationsPage = read("apps/admin/app/admin/dashboard/search-anchors/operations/page.tsx");
const searchAnchorOperationsControls = read("apps/admin/app/admin/dashboard/search-anchors/operations/SearchAnchorOperationsControls.tsx");
const searchAnchorReconciliationRoute = read("apps/admin/app/api/admin/search-anchors/reconciliation/route.ts");
if (
  !searchAnchorOperationsPage.includes("@theouthaven/db/admin-client") ||
  !searchAnchorOperationsPage.includes('from("search_anchor_reconciliation_queue")') ||
  !searchAnchorOperationsPage.includes('from("cron_job_runs")') ||
  searchAnchorOperationsPage.includes("@/lib/supabase-admin") ||
  searchAnchorOperationsPage.includes("supabaseAdmin")
) {
  throw new Error("Search Anchors operations must use shared Admin DB access for queue and cron telemetry.");
}
if (!searchAnchorOperationsControls.includes("/api/admin/search-anchors/reconciliation")) {
  throw new Error("Search Anchors operations controls must call the isolated reconciliation API.");
}
if (
  !searchAnchorReconciliationRoute.includes("@theouthaven/auth/admin-session") ||
  !searchAnchorReconciliationRoute.includes("@theouthaven/db/admin-client") ||
  !searchAnchorReconciliationRoute.includes('new Set(["superadmin", "admin", "manager"])') ||
  searchAnchorReconciliationRoute.includes("@/lib/admin-api-auth") ||
  searchAnchorReconciliationRoute.includes("@/lib/supabase-admin")
) {
  throw new Error("Search Anchors reconciliation API must use isolated Admin auth and shared DB access.");
}

const searchAnchorsUploadPage = read("apps/admin/app/admin/dashboard/search-anchors/upload/page.tsx");
const searchAnchorsUploadClient = read("apps/admin/app/admin/dashboard/search-anchors/upload/SearchAnchorCsvUploader.tsx");
const searchAnchorsImportRoute = read("apps/admin/app/api/admin/search-anchors/import/route.ts");
if (
  !searchAnchorsUploadClient.includes("/api/admin/search-anchors/import") ||
  !searchAnchorsImportRoute.includes("@theouthaven/auth/admin-session") ||
  !searchAnchorsImportRoute.includes("@theouthaven/db/admin-client") ||
  !searchAnchorsImportRoute.includes("@/lib/aws/integration-api") ||
  !searchAnchorsImportRoute.includes('new Set(["superadmin", "admin", "manager"])') ||
  !searchAnchorsImportRoute.includes('from("search_anchors")')
) {
  throw new Error("Search Anchors CSV upload must use isolated Admin auth/shared DB and preserve import behavior.");
}
for (const source of [searchAnchorsUploadPage, searchAnchorsImportRoute]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/google/places-new-client")
  ) {
    throw new Error("Search Anchors CSV upload must not import root monolith auth/database/Google helpers.");
  }
}

const searchAnchorsSyncPreviewPage = read("apps/admin/app/admin/dashboard/search-anchors/sync-preview/page.tsx");
const searchAnchorsSyncPreviewClient = read("apps/admin/app/admin/dashboard/search-anchors/sync-preview/SyncPreviewClient.tsx");
const searchAnchorsSyncPreviewRoute = read("apps/admin/app/api/admin/search-anchors/sync-preview/route.ts");
const searchAnchorsSyncApproveRoute = read("apps/admin/app/api/admin/search-anchors/sync-preview/[runId]/approve/route.ts");
const searchAnchorsBackfillRoute = read("apps/admin/app/api/admin/search-anchors/backfill/route.ts");
const searchAnchorsBackfillRuntime = read("apps/admin/lib/search/anchors/backfill.ts");
const searchAnchorsSyncPreviewRuntime = read("apps/admin/lib/search/anchors/syncPreview.ts");

if (
  !searchAnchorsSyncPreviewClient.includes("/api/admin/search-anchors/sync-preview") ||
  !searchAnchorsSyncPreviewClient.includes("/api/admin/search-anchors/backfill") ||
  !searchAnchorsSyncPreviewRoute.includes("@theouthaven/auth/admin-session") ||
  !searchAnchorsSyncPreviewRoute.includes("@theouthaven/db/admin-client") ||
  !searchAnchorsSyncPreviewRoute.includes("@/lib/search/anchors/syncPreview") ||
  !searchAnchorsSyncApproveRoute.includes("@theouthaven/auth/admin-session") ||
  !searchAnchorsSyncApproveRoute.includes("@theouthaven/db/admin-client") ||
  !searchAnchorsBackfillRoute.includes("@theouthaven/auth/admin-session") ||
  !searchAnchorsBackfillRoute.includes("@/lib/search/anchors/backfill") ||
  !searchAnchorsBackfillRuntime.includes("@theouthaven/db/admin-client")
) {
  throw new Error("Search Anchors Dry Run & Approval must use isolated Admin auth/shared DB and preserve preview/approval/backfill behavior.");
}
for (const source of [
  searchAnchorsSyncPreviewPage,
  searchAnchorsSyncPreviewRoute,
  searchAnchorsSyncApproveRoute,
  searchAnchorsBackfillRoute,
  searchAnchorsBackfillRuntime,
  searchAnchorsSyncPreviewRuntime,
]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error("Search Anchors Dry Run & Approval must not import root monolith auth/database helpers.");
  }
}

const adminOverviewPage = read("apps/admin/app/admin/dashboard/page.tsx");
const adminOverviewRuntime = read("apps/admin/lib/admin/admin-overview.ts");
const adminLocationSearch = read("apps/admin/components/admin/AdminLocationSearch.tsx");
const adminLocationSearchRoute = read("apps/admin/app/api/admin/locations/search/route.ts");

if (
  !adminOverviewPage.includes("@theouthaven/auth/admin-session") ||
  !adminOverviewPage.includes("@theouthaven/auth/admin-roles") ||
  !adminOverviewPage.includes("@/lib/admin/admin-overview") ||
  !adminOverviewPage.includes("@/components/admin/AdminLocationSearch") ||
  !adminOverviewRuntime.includes("@theouthaven/db/admin-client") ||
  !adminOverviewRuntime.includes('from("location_reservations")') ||
  !adminOverviewRuntime.includes('from("business_websites")') ||
  !adminOverviewRuntime.includes('from("website_hosting_nodes")') ||
  !adminLocationSearch.includes("/api/admin/locations/search") ||
  !adminLocationSearchRoute.includes("@theouthaven/auth/admin-session") ||
  !adminLocationSearchRoute.includes("@theouthaven/db/admin-client")
) {
  throw new Error("Admin Overview must use isolated auth/shared DB and preserve overview/search behavior.");
}
for (const source of [adminOverviewPage, adminOverviewRuntime, adminLocationSearchRoute]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/components/admin/AdminDesignSystem")
  ) {
    throw new Error("Admin Overview must not import root monolith auth/database/UI helpers.");
  }
}
if (adminOverviewPage.includes("Admin dashboard migration scaffold")) {
  throw new Error("Admin Overview must not remain a migration scaffold.");
}

const googleEnrichmentRedirectPage = read("apps/admin/app/admin/dashboard/locations/google-enrichment/page.tsx");
if (
  !googleEnrichmentRedirectPage.includes('redirect("/admin/dashboard/settings/location-tools/enrichment")') ||
  googleEnrichmentRedirectPage.includes("@/lib/")
) {
  throw new Error("Google Enrichment legacy route must remain an isolated redirect to location tools enrichment.");
}

const searchHealthPage = read("apps/admin/app/admin/dashboard/search-health/page.tsx");
const searchHealthDashboardRuntime = read("apps/admin/lib/admin/search-health-dashboard.ts");
const searchHealthClient = read("apps/admin/app/admin/dashboard/search-health/SearchHealthClient.tsx");
const searchHealthQaRunner = read("apps/admin/app/admin/dashboard/search-health/BatchQaRunner.tsx");
const searchHealthQualityPanel = read("apps/admin/app/admin/dashboard/search-health/SearchQualityReviewPanel.tsx");
if (
  !searchHealthPage.includes("@theouthaven/auth/admin-session") ||
  !searchHealthPage.includes("@theouthaven/db/admin-client") ||
  !searchHealthPage.includes('requireAdminRole(["superadmin", "admin", "experience_team"])') ||
  !searchHealthPage.includes("@/lib/admin/search-health-dashboard") ||
  !searchHealthPage.includes("@/lib/search/searchCoreConfig")
) {
  throw new Error("Search Health dashboard must use isolated Admin auth/shared DB and isolated search-health runtime.");
}
for (const source of [searchHealthPage, searchHealthDashboardRuntime]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-api-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/components/admin/AdminDesignSystem")
  ) {
    throw new Error("Search Health dashboard slice must not import root monolith auth/database/UI helpers.");
  }
}
if (
  !searchHealthDashboardRuntime.includes("@theouthaven/db/admin-client") ||
  !searchHealthDashboardRuntime.includes('from("search_events")') ||
  !searchHealthDashboardRuntime.includes('from("search_health_events")') ||
  !searchHealthDashboardRuntime.includes('rpc("admin_search_health_kpis"')
) {
  throw new Error("Search Health dashboard runtime must preserve search events, issues, and KPI reads.");
}
if (
  !searchHealthClient.includes("/api/admin/search-health") ||
  !searchHealthClient.includes("/api/admin/search-health/test-event") ||
  !searchHealthClient.includes("/api/admin/search-health/send-digest") ||
  !searchHealthQaRunner.includes("/api/admin/search-health/qa-prompts") ||
  !searchHealthQaRunner.includes("/api/admin/search-health/batch-run") ||
  !searchHealthQualityPanel.includes("/api/admin/search-health/quality-review")
) {
  throw new Error("Search Health clients must preserve the protected Admin API contract for later route isolation.");
}

const searchHealthApiRoute = read("apps/admin/app/api/admin/search-health/route.ts");
if (
  !searchHealthApiRoute.includes("@/lib/admin-api-auth") ||
  !searchHealthApiRoute.includes("@theouthaven/db/admin-client") ||
  !searchHealthApiRoute.includes('requireAdminApiRole(["superadmin", "admin", "experience_team"])') ||
  !searchHealthApiRoute.includes('from("search_health_events")') ||
  !searchHealthApiRoute.includes('from("search_events")')
) {
  throw new Error("Primary Search Health API must use isolated Admin auth/shared DB and preserve health/search reads.");
}
if (
  searchHealthApiRoute.includes("@/lib/admin-permissions") ||
  searchHealthApiRoute.includes("@/lib/supabase-admin")
) {
  throw new Error("Primary Search Health API must not import root monolith permissions/database helpers.");
}

const searchHealthDetailApiRoute = read("apps/admin/app/api/admin/search-health/[id]/route.ts");
if (
  !searchHealthDetailApiRoute.includes("@/lib/admin-api-auth") ||
  !searchHealthDetailApiRoute.includes("@theouthaven/db/admin-client") ||
  !searchHealthDetailApiRoute.includes('requireAdminApiRole(["superadmin", "admin", "experience_team"])') ||
  !searchHealthDetailApiRoute.includes('from("search_health_events")') ||
  !searchHealthDetailApiRoute.includes("REVIEW_STATUSES")
) {
  throw new Error("Search Health detail API must use isolated auth/shared DB and preserve issue review behavior.");
}
if (
  searchHealthDetailApiRoute.includes("@/lib/admin-permissions") ||
  searchHealthDetailApiRoute.includes("@/lib/supabase-admin")
) {
  throw new Error("Search Health detail API must not import root monolith permissions/database helpers.");
}

const searchHealthQualityApiRoute = read("apps/admin/app/api/admin/search-health/quality-review/route.ts");
if (
  !searchHealthQualityApiRoute.includes("@/lib/admin-api-auth") ||
  !searchHealthQualityApiRoute.includes("@theouthaven/db/admin-client") ||
  !searchHealthQualityApiRoute.includes('requireAdminApiRole(["superadmin", "admin", "experience_team"])') ||
  !searchHealthQualityApiRoute.includes("if (auth.error) return auth.error") ||
  !searchHealthQualityApiRoute.includes('from("search_events")')
) {
  throw new Error("Search Health quality-review API must enforce isolated auth/shared DB and preserve review reads/updates.");
}
if (
  searchHealthQualityApiRoute.includes("@/lib/admin-permissions") ||
  searchHealthQualityApiRoute.includes("@/lib/supabase-admin")
) {
  throw new Error("Search Health quality-review API must not import root monolith permissions/database helpers.");
}

const payoutsPage = read("apps/admin/app/admin/dashboard/payouts/page.tsx");
if (
  !payoutsPage.includes("@theouthaven/auth/admin-session") ||
  !payoutsPage.includes("@/lib/admin/admin-payouts") ||
  !payoutsPage.includes('requireAdminRole(["superadmin", "admin"])')
) {
  throw new Error("Payouts page must use isolated Admin auth/runtime and preserve payout roles.");
}
if (
  payoutsPage.includes("@/lib/admin-auth") ||
  payoutsPage.includes("@/lib/admin-permissions") ||
  payoutsPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Payouts page must not import root monolith auth/design-system modules.");
}

const payoutsRuntime = read("apps/admin/lib/admin/admin-payouts.ts");
if (
  !payoutsRuntime.includes("@theouthaven/db/admin-client") ||
  !payoutsRuntime.includes("@/lib/aws/integration-api")
) {
  throw new Error("Payouts runtime must use shared Admin DB and isolated Stripe integration API.");
}
if (
  payoutsRuntime.includes("@/lib/supabase-admin") ||
  payoutsRuntime.includes("@/lib/stripe/server") ||
  payoutsRuntime.includes("@/lib/aws/core-api")
) {
  throw new Error("Payouts runtime must not import root DB, Stripe, or core API helpers.");
}

const payoutsIntegration = read("apps/admin/lib/aws/integration-api.ts");
if (!payoutsIntegration.includes("readStripeConnectPayoutsViaIntegrationApi")) {
  throw new Error("Isolated integration API must expose Stripe Connect payout reads.");
}
if (!adminNavigation.includes("/admin/dashboard/payouts")) {
  throw new Error("Payouts navigation must be present in the isolated Admin shell.");
}

const billingPage = read("apps/admin/app/admin/dashboard/billing/page.tsx");
const billingRuntime = read("apps/admin/lib/admin/admin-billing.ts");
const billingCoreApi = read("apps/admin/lib/aws/core-api.ts");
const billingPlans = read("apps/admin/lib/billing/plans.ts");
if (
  !billingPage.includes("@theouthaven/auth/admin-session") ||
  !billingPage.includes('requireAdminRole(["superadmin"])') ||
  !billingPage.includes("@/lib/admin/admin-billing") ||
  !billingRuntime.includes("@theouthaven/db/admin-client") ||
  !billingRuntime.includes("@/lib/aws/core-api") ||
  !billingRuntime.includes("@/lib/billing/plans")
) {
  throw new Error("Billing must use isolated superadmin auth, shared DB, and isolated billing runtime.");
}
for (const source of [billingPage, billingRuntime, billingCoreApi, billingPlans]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/aws/core-api")
      && source === billingPage
  ) {
    throw new Error("Billing slice must not import root monolith auth/database/runtime modules.");
  }
}
if (
  !billingCoreApi.includes("/v1/admin/billing/read") ||
  !billingCoreApi.includes("AWS_PLATFORM_CORE_API_URL") ||
  !billingCoreApi.includes("createHmac")
) {
  throw new Error("Billing Core API reader must preserve signed AWS billing reads.");
}

const plansPage = read("apps/admin/app/admin/dashboard/plans/page.tsx");
if (
  !plansPage.includes("@theouthaven/auth/admin-session") ||
  !plansPage.includes("@theouthaven/db/admin-client") ||
  !plansPage.includes('requireAdminRole(["superadmin"])') ||
  !plansPage.includes("@/lib/billing/plans")
) {
  throw new Error("Plans page must use isolated superadmin auth, shared DB, and isolated billing helpers.");
}
if (
  plansPage.includes("@/lib/admin-auth") ||
  plansPage.includes("@/lib/admin-permissions") ||
  plansPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Plans page must not import root monolith auth/database modules.");
}

const shortLinksPage = read("apps/admin/app/admin/dashboard/short-links/page.tsx");
const shortLinksListRoute = read("apps/admin/app/api/admin/short-links/route.ts");
const shortLinksDetailRoute = read("apps/admin/app/api/admin/short-links/[id]/route.ts");
const shortLinksDestinationsRoute = read("apps/admin/app/api/admin/short-links/destinations/route.ts");
const shortLinksHelper = read("apps/admin/lib/outings/short-links.ts");
const shortLinksService = read("apps/admin/lib/short-links/service.ts");
for (const source of [
  shortLinksPage,
  shortLinksListRoute,
  shortLinksDetailRoute,
  shortLinksDestinationsRoute,
  shortLinksHelper,
  shortLinksService,
]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/users/roles")
  ) {
    throw new Error("Short Links slice must not import root monolith auth/database/role helpers.");
  }
}
if (
  !shortLinksPage.includes("@theouthaven/auth/admin-session") ||
  !shortLinksPage.includes('requireAdminRole(["superadmin", "admin", "manager", "marketing_specialist", "marketing_manager"])')
) {
  throw new Error("Short Links page must preserve isolated role authorization.");
}
for (const route of [shortLinksListRoute, shortLinksDetailRoute, shortLinksDestinationsRoute]) {
  if (
    !route.includes("@/lib/admin-api-auth") ||
    !route.includes("@theouthaven/db/admin-client") ||
    !route.includes("@theouthaven/auth/admin-roles")
  ) {
    throw new Error("Short Links APIs must use isolated API auth, shared DB, and shared roles.");
  }
}
if (
  !shortLinksListRoute.includes("@/lib/outings/short-links") ||
  !shortLinksListRoute.includes("@/lib/short-links/service") ||
  !shortLinksDetailRoute.includes("@/lib/outings/short-links")
) {
  throw new Error("Short Links APIs must preserve isolated short-link runtime helpers.");
}

const rolesPage = read("apps/admin/app/admin/dashboard/roles/page.tsx");
const rolesConsole = read("apps/admin/components/admin/AdminRolesConsole.tsx");
const adminPermissions = read("apps/admin/lib/admin-permissions.ts");
const adminRolePolicy = read("apps/admin/lib/admin-role-policy.ts");
const adminRoleAudit = read("apps/admin/lib/admin-role-audit.ts");
const adminSystem = read("apps/admin/lib/admin-system.ts");
for (const source of [rolesPage, rolesConsole, adminPermissions, adminRolePolicy, adminRoleAudit, adminSystem]) {
  if (
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/supabase-admin") ||
    source.includes("@/lib/users/roles")
  ) {
    throw new Error("Roles & Permissions slice must not import root monolith auth/database/role helpers.");
  }
}
if (
  !rolesPage.includes("@theouthaven/auth/admin-session") ||
  !rolesPage.includes('requireAdminRole(["superadmin"])') ||
  !rolesPage.includes("@/lib/admin-role-policy") ||
  !rolesPage.includes("@/lib/admin-system") ||
  !rolesPage.includes("@/lib/admin-role-audit")
) {
  throw new Error("Roles & Permissions page must preserve isolated superadmin authorization and runtime loaders.");
}
for (const roleRoute of [
  "apps/admin/app/api/admin/system/role-policies/[role]/route.ts",
  "apps/admin/app/api/admin/system/role-members/route.ts",
  "apps/admin/app/api/admin/system/role-members/[adminId]/route.ts",
]) {
  const source = read(roleRoute);
  if (
    !source.includes("@/lib/admin-api-auth") ||
    !source.includes('requireAdminApiRole(["superadmin"])') ||
    source.includes("@/lib/admin-auth") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Roles API must enforce isolated superadmin API authorization: ${roleRoute}`);
  }
}
if (
  !adminRolePolicy.includes("@theouthaven/db/admin-client") ||
  !adminSystem.includes("@theouthaven/db/admin-client") ||
  !adminRoleAudit.includes("@theouthaven/db/admin-client")
) {
  throw new Error("Roles runtimes must use the shared Admin DB package.");
}
if (
  !read("apps/admin/app/admin/dashboard/admin-navigation.ts").includes("/admin/dashboard/roles")
) {
  throw new Error("Roles & Permissions navigation must be present in the isolated Admin shell.");
}

const seoToolsPage = read("apps/admin/app/admin/dashboard/seo-tools/page.tsx");
if (
  !seoToolsPage.includes("@theouthaven/auth/admin-session") ||
  !seoToolsPage.includes("@theouthaven/db/admin-client") ||
  !seoToolsPage.includes("@/lib/admin-permissions") ||
  seoToolsPage.includes("@/lib/admin-auth") ||
  seoToolsPage.includes("@/lib/supabase-admin")
) {
  throw new Error("SEO Tools page must use isolated Admin auth, permissions, and shared DB.");
}
for (const seoRoute of [
  "apps/admin/app/api/admin/seo/setup/route.ts",
  "apps/admin/app/api/admin/seo/audit/route.ts",
]) {
  const source = read(seoRoute);
  if (
    !source.includes("@/lib/admin-api-auth") ||
    !source.includes("@/lib/admin-permissions") ||
    !source.includes("@theouthaven/db/admin-client") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`SEO Tools API must preserve isolated auth and shared DB access: ${seoRoute}`);
  }
}
const seoInspection = read("apps/admin/lib/admin/seo/live-inspection.ts");
if (seoInspection.includes("@/lib/")) {
  throw new Error("SEO live inspection runtime must remain self-contained.");
}
if (!read("apps/admin/app/admin/dashboard/admin-navigation.ts").includes("/admin/dashboard/seo-tools")) {
  throw new Error("SEO Tools navigation must be present in the isolated Admin shell.");
}

const seoOperationsPage = read("apps/admin/app/admin/dashboard/seo/page.tsx");
const seoOperationsClient = read("apps/admin/app/admin/dashboard/seo/SeoOperationsClient.tsx");
if (
  !seoOperationsPage.includes("@theouthaven/auth/admin-session") ||
  !seoOperationsPage.includes("@/lib/admin-permissions") ||
  seoOperationsPage.includes("@/lib/admin-auth") ||
  seoOperationsPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("SEO Operations page must use isolated auth and local presentation.");
}
for (const seoOperationsRoute of [
  "apps/admin/app/api/admin/seo/runs/route.ts",
  "apps/admin/app/api/admin/seo/issues/route.ts",
  "apps/admin/app/api/admin/seo/inspect/route.ts",
]) {
  const source = read(seoOperationsRoute);
  if (
    !source.includes("@/lib/admin-api-auth") ||
    !source.includes("@/lib/admin-permissions") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`SEO Operations route must preserve isolated auth/database boundaries: ${seoOperationsRoute}`);
  }
}
for (const endpoint of ["/api/admin/seo/runs", "/api/admin/seo/issues", "/api/admin/seo/inspect", "/api/admin/seo/audit"]) {
  if (!seoOperationsClient.includes(endpoint)) {
    throw new Error(`SEO Operations client must use isolated endpoint: ${endpoint}`);
  }
}
if (!read("apps/admin/app/admin/dashboard/admin-navigation.ts").includes("/admin/dashboard/seo")) {
  throw new Error("SEO Operations navigation must be present in isolated Admin.");
}

const productionFinishLinePage = read("apps/admin/app/admin/dashboard/production/page.tsx");
const productionFinishLineClient = read("apps/admin/app/admin/dashboard/production/ProductionCommandCenterClient.tsx");
if (
  !productionFinishLinePage.includes("@theouthaven/auth/admin-session") ||
  !productionFinishLinePage.includes("@/lib/admin-permissions") ||
  productionFinishLinePage.includes("@/lib/admin-auth")
) {
  throw new Error("Production Finish Line page must use isolated Admin auth and permissions.");
}
for (const endpoint of [
  "/api/admin/production-finish-line",
  "/api/admin/production-finish-line/run-gate",
]) {
  if (!productionFinishLineClient.includes(endpoint)) {
    throw new Error(`Production Finish Line client must use isolated endpoint: ${endpoint}`);
  }
}
for (const productionRoute of [
  "apps/admin/app/api/admin/production-finish-line/route.ts",
  "apps/admin/app/api/admin/production-finish-line/run-gate/route.ts",
]) {
  const source = read(productionRoute);
  if (
    !source.includes("@/lib/admin-api-auth") ||
    !source.includes("@/lib/admin-permissions") ||
    !source.includes("@theouthaven/db/admin-client") ||
    source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Production Finish Line route must preserve isolated auth/database boundaries: ${productionRoute}`);
  }
}
for (const productionRuntime of [
  "apps/admin/lib/production-finish-line/seeds.ts",
  "apps/admin/lib/production-finish-line/gate-tests.ts",
]) {
  if (read(productionRuntime).includes("@/lib/")) {
    throw new Error(`Production Finish Line runtime must remain self-contained: ${productionRuntime}`);
  }
}
if (!read("apps/admin/app/admin/dashboard/admin-navigation.ts").includes("/admin/dashboard/production")) {
  throw new Error("Production Finish Line navigation must be present in isolated Admin.");
}

const criticalIncidentsPage = read("apps/admin/app/admin/dashboard/infrastructure/incidents/page.tsx");
if (
  !criticalIncidentsPage.includes("@theouthaven/auth/admin-session") ||
  !criticalIncidentsPage.includes("@theouthaven/db/admin-client") ||
  !criticalIncidentsPage.includes("@/lib/admin-permissions") ||
  criticalIncidentsPage.includes("@/lib/admin-auth") ||
  criticalIncidentsPage.includes("@/lib/supabase-admin") ||
  criticalIncidentsPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Critical Incidents must use isolated Admin auth/shared DB and local presentation.");
}
if (!criticalIncidentsPage.includes('.eq("category", "critical_alert")')) {
  throw new Error("Critical Incidents must remain scoped to critical alert history.");
}
if (!read("apps/admin/app/admin/dashboard/admin-navigation.ts").includes("/admin/dashboard/infrastructure/incidents")) {
  throw new Error("Critical Incidents navigation must be present in isolated Admin.");
}

const launchCatalogPage = read("apps/admin/app/admin/dashboard/launch-catalog/page.tsx");
const launchCatalogClient = read("apps/admin/app/admin/dashboard/launch-catalog/LaunchCatalogClient.tsx");
const launchCatalogRoute = read("apps/admin/app/api/admin/launch-catalog/route.ts");
const launchCatalogRuntime = read("apps/admin/lib/admin/location-launch-health.ts");
if (
  !launchCatalogPage.includes("@theouthaven/auth/admin-session") ||
  !launchCatalogPage.includes("@/lib/admin/location-launch-health") ||
  launchCatalogPage.includes("@/lib/admin-auth") ||
  launchCatalogPage.includes("@/components/admin/AdminDesignSystem")
) {
  throw new Error("Launch Catalog page must use isolated Admin auth/runtime and local presentation.");
}
if (!launchCatalogClient.includes("/api/admin/launch-catalog")) {
  throw new Error("Launch Catalog client must use isolated Launch Catalog API.");
}
if (
  !launchCatalogRoute.includes("@/lib/admin-api-auth") ||
  !launchCatalogRoute.includes("@/lib/admin-permissions") ||
  !launchCatalogRoute.includes("@/lib/admin/location-launch-health")
) {
  throw new Error("Launch Catalog API must preserve isolated Admin auth and runtime.");
}
if (
  !launchCatalogRuntime.includes("@theouthaven/db/admin-client") ||
  launchCatalogRuntime.includes("@/lib/supabase-admin")
) {
  throw new Error("Launch Catalog runtime must use shared Admin DB access.");
}
if (launchCatalogRuntime.includes("const supabaseAdmin = getAdminDatabaseClient()")) {
  throw new Error("Launch Catalog runtime must not initialize the Admin DB client at module scope.");
}
if (!read("apps/admin/app/admin/dashboard/admin-navigation.ts").includes("/admin/dashboard/launch-catalog")) {
  throw new Error("Launch Catalog navigation must be present in isolated Admin.");
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
if (
  !productionCi.includes("apps/(admin|business)/") ||
  !productionCi.includes("infra/aws/web-surfaces/") ||
  !productionCi.includes("infra/aws/cloudformation/web-surfaces-services\\.yml") ||
  !productionCi.includes("scripts/(surface-app-isolation-regression|web-surfaces-services-regression)\\.mjs")
) {
  throw new Error("Production CI must reserve the fast quality lane for isolated Admin/Business and their AWS service boundary changes.");
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


const crmRedirectRoutes = [
  "apps/admin/app/admin/dashboard/crm/contacts/page.tsx",
  "apps/admin/app/admin/dashboard/crm/knowledge-base/page.tsx",
  "apps/admin/app/admin/dashboard/crm/locations/[id]/page.tsx",
  "apps/admin/app/admin/dashboard/crm/accounts/[id]/contacts/page.tsx",
  "apps/admin/app/admin/dashboard/crm/escalations/[id]/page.tsx",
  "apps/admin/app/admin/dashboard/crm/change-requests/[id]/page.tsx",
  "apps/admin/app/admin/dashboard/crm/escalations/page.tsx",
  "apps/admin/app/admin/dashboard/crm/work-queue/page.tsx",
  "apps/admin/app/admin/dashboard/crm/change-requests/page.tsx",
];
for (const route of crmRedirectRoutes) {
  const source = read(route);
  if (!source.includes("next/navigation")) {
    throw new Error(`CRM redirect route must remain isolated inside Admin: ${route}`);
  }
}
const crmClaimCodesShim = read("apps/admin/app/admin/dashboard/crm/claims/claim-codes/page.tsx");
if (!crmClaimCodesShim.includes('export { default } from "../../claim-codes/page"')) {
  throw new Error("CRM claims claim-codes shim must preserve the isolated claim-codes re-export.");
}
const crmClaimCodesPage = read("apps/admin/app/admin/dashboard/crm/claim-codes/page.tsx");
if (!crmClaimCodesPage.includes("@theouthaven/auth/admin-session") || !crmClaimCodesPage.includes("@/lib/crm/claim-codes")) {
  throw new Error("CRM claim-codes page must use isolated Admin auth and data access.");
}
const crmClaimCodesData = read("apps/admin/lib/crm/claim-codes.ts");
if (!crmClaimCodesData.includes("@theouthaven/db/admin-client") || crmClaimCodesData.includes("@/lib/supabase-admin")) {
  throw new Error("CRM claim-codes data helper must use the shared Admin DB boundary.");
}
const crmTasksRedirect = read("apps/admin/app/admin/dashboard/crm/tasks/page.tsx");
if (!crmTasksRedirect.includes("@theouthaven/auth/admin-session") || !crmTasksRedirect.includes("@/lib/crm/permissions")) {
  throw new Error("CRM tasks redirect must use isolated Admin auth and CRM permissions.");
}
if (crmTasksRedirect.includes("@/lib/admin-auth") || crmTasksRedirect.includes("@/lib/admin-permissions")) {
  throw new Error("CRM tasks redirect must not import root monolith auth modules.");
}


const crmGtmIntelligencePages = [
  "apps/admin/app/admin/dashboard/crm/gtm/revenue/page.tsx",
  "apps/admin/app/admin/dashboard/crm/gtm/territories/page.tsx",
  "apps/admin/app/admin/dashboard/crm/gtm/attribution/page.tsx",
];
for (const route of crmGtmIntelligencePages) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session") || !source.includes("@/lib/gtm/")) {
    throw new Error(`CRM GTM intelligence page must use isolated Admin auth/data helpers: ${route}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM GTM intelligence page must not import root monolith auth/database modules: ${route}`);
  }
}
for (const helper of [
  "apps/admin/lib/gtm/revenue.ts",
  "apps/admin/lib/gtm/territories.ts",
  "apps/admin/lib/gtm/attribution.ts",
  "apps/admin/lib/gtm/benchmarks.ts",
]) {
  const source = read(helper);
  if (!source.includes("@theouthaven/db/admin-client") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM GTM helper must use shared Admin DB: ${helper}`);
  }
}


const crmGtmCorePages = [
  "apps/admin/app/admin/dashboard/crm/gtm/page.tsx",
  "apps/admin/app/admin/dashboard/crm/gtm/sequences/page.tsx",
  "apps/admin/app/admin/dashboard/crm/gtm/[locationId]/page.tsx",
];
for (const route of crmGtmCorePages) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session")) {
    throw new Error(`CRM GTM core page must use isolated Admin auth: ${route}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM GTM core page must not import root monolith auth/database modules: ${route}`);
  }
}
for (const helper of [
  "apps/admin/lib/gtm/queries.ts",
  "apps/admin/lib/gtm/sequenceMetrics.ts",
]) {
  const source = read(helper);
  if (!source.includes("@theouthaven/db/admin-client") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM GTM core helper must use shared Admin DB: ${helper}`);
  }
}
const crmGtmPriorityPanel = read("apps/admin/components/admin/crm/GtmPriorityPanel.tsx");
if (!crmGtmPriorityPanel.includes("/admin/dashboard/crm/gtm")) {
  throw new Error("CRM GTM priority panel must preserve Admin GTM navigation.");
}


const crmOperationsReportsPages = [
  "apps/admin/app/admin/dashboard/crm/operations/page.tsx",
  "apps/admin/app/admin/dashboard/crm/reports/page.tsx",
];
for (const route of crmOperationsReportsPages) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session") || !source.includes("@/lib/crm/operations-reports")) {
    throw new Error(`CRM operations/report page must use isolated Admin auth/data helper: ${route}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/crm/core-modules")) {
    throw new Error(`CRM operations/report page must not import root monolith auth/data modules: ${route}`);
  }
}
const crmOperationsReportsHelper = read("apps/admin/lib/crm/operations-reports.ts");
if (
  !crmOperationsReportsHelper.includes("@theouthaven/db/admin-client")
  || !crmOperationsReportsHelper.includes("@/lib/aws/core-api")
  || crmOperationsReportsHelper.includes("@/lib/supabase-admin")
) {
  throw new Error("CRM operations/report helper must preserve isolated Core API fallback and shared Admin DB access.");
}
const isolatedCoreApi = read("apps/admin/lib/aws/core-api.ts");
for (const dependency of [
  "readCrmOperationsSnapshotViaCoreApi",
  "readCrmReportSnapshotViaCoreApi",
  "platformCoreApiConfigured",
]) {
  if (!isolatedCoreApi.includes(dependency)) {
    throw new Error(`Isolated Admin Core API helper must expose CRM operation/report dependency: ${dependency}`);
  }
}


const crmClaimsPages = [
  "apps/admin/app/admin/dashboard/crm/claims/page.tsx",
  "apps/admin/app/admin/dashboard/crm/claims/[id]/page.tsx",
];
for (const route of crmClaimsPages) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session") || !source.includes("@/lib/crm/claims")) {
    throw new Error(`CRM claims page must use isolated Admin auth/data helper: ${route}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/crm/core-modules")) {
    throw new Error(`CRM claims page must not import root monolith auth/data modules: ${route}`);
  }
}
const crmClaimsHelper = read("apps/admin/lib/crm/claims.ts");
if (!crmClaimsHelper.includes("@theouthaven/db/admin-client") || crmClaimsHelper.includes("@/lib/supabase-admin")) {
  throw new Error("CRM claims helper must use shared Admin DB.");
}
const crmContextHelper = read("apps/admin/lib/crm/context.ts");
if (!crmContextHelper.includes("@theouthaven/db/admin-client") || crmContextHelper.includes("@/lib/supabase-admin")) {
  throw new Error("CRM context helper must use shared Admin DB.");
}
const crmContextBanner = read("apps/admin/components/admin/crm/CrmContextBanner.tsx");
if (!crmContextBanner.includes("@theouthaven/db/admin-client") || crmContextBanner.includes("@/lib/supabase-admin")) {
  throw new Error("CRM context banner must use shared Admin DB.");
}


const crmAutomationPages = [
  "apps/admin/app/admin/dashboard/crm/communications/automation/page.tsx",
  "apps/admin/app/admin/dashboard/crm/communications/automation/settings/page.tsx",
  "apps/admin/app/admin/dashboard/crm/communications/automation/executions/[executionId]/page.tsx",
];
for (const route of crmAutomationPages) {
  const source = read(route);
  if (!source.includes("@theouthaven/db/admin-client")) {
    throw new Error(`CRM automation page must use shared Admin DB: ${route}`);
  }
  if (source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM automation page must not import root monolith DB helper: ${route}`);
  }
}


const crmSupportQueueSettingsPages = [
  "apps/admin/app/admin/dashboard/crm/support/page.tsx",
  "apps/admin/app/admin/dashboard/crm/support/settings/page.tsx",
];
for (const route of crmSupportQueueSettingsPages) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session")) {
    throw new Error(`CRM support page must use isolated Admin auth: ${route}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/admin-permissions") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM support page must not import root monolith auth/DB modules: ${route}`);
  }
}
const crmSupportSettingsActions = read("apps/admin/app/admin/dashboard/crm/support/settings/actions.ts");
if (
  !crmSupportSettingsActions.includes("@theouthaven/auth/admin-session")
  || !crmSupportSettingsActions.includes("@theouthaven/db/admin-client")
  || crmSupportSettingsActions.includes("@/lib/supabase-admin")
) {
  throw new Error("CRM support settings actions must use isolated Admin auth and shared Admin DB.");
}
for (const helper of [
  "apps/admin/lib/crm/support.ts",
  "apps/admin/lib/support/operations.ts",
  "apps/admin/lib/support/canonical.ts",
]) {
  const source = read(helper);
  if (!source.includes("@theouthaven/db/admin-client") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM support helper must use shared Admin DB: ${helper}`);
  }
}
const supportCoreApi = read("apps/admin/lib/aws/core-api.ts");
if (!supportCoreApi.includes("readSupportOperationsSettingsViaCoreApi")) {
  throw new Error("Isolated Admin Core API helper must preserve support settings reads.");
}


const crmForecastPage = read("apps/admin/app/admin/dashboard/crm/forecast/page.tsx");
if (
  !crmForecastPage.includes("@theouthaven/auth/admin-session")
  || !crmForecastPage.includes("@/lib/crm/opportunities/queries")
  || crmForecastPage.includes("@/lib/admin-auth")
) {
  throw new Error("CRM forecast page must use isolated Admin auth and opportunity reads.");
}
const crmOpportunityQueries = read("apps/admin/lib/crm/opportunities/queries.ts");
if (!crmOpportunityQueries.includes("@theouthaven/db/admin-client") || crmOpportunityQueries.includes("@/lib/supabase-admin")) {
  throw new Error("CRM opportunity query helper must use shared Admin DB.");
}
for (const helper of [
  "apps/admin/lib/crm/pipelines.ts",
  "apps/admin/lib/crm/opportunities/pipeline-normalization.ts",
  "apps/admin/lib/crm/opportunities/forecasting.ts",
  "apps/admin/lib/crm/opportunities/validation.ts",
  "apps/admin/lib/crm/opportunities/types.ts",
]) {
  read(helper);
}


const crmOpportunityPages = [
  "apps/admin/app/admin/dashboard/crm/opportunities/page.tsx",
  "apps/admin/app/admin/dashboard/crm/opportunities/[id]/page.tsx",
];
for (const route of crmOpportunityPages) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session")) {
    throw new Error(`CRM opportunity page must use isolated Admin auth: ${route}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM opportunity page must not import root monolith auth/DB modules: ${route}`);
  }
}
const crmOpportunityActions = read("apps/admin/app/admin/dashboard/crm/opportunities/actions.ts");
if (!crmOpportunityActions.includes("@theouthaven/auth/admin-session") || crmOpportunityActions.includes("@/lib/admin-auth")) {
  throw new Error("CRM opportunity actions must use isolated Admin auth.");
}
for (const helper of [
  "apps/admin/lib/crm/opportunities/service.ts",
  "apps/admin/lib/crm/activities.ts",
]) {
  const source = read(helper);
  if (!source.includes("@theouthaven/db/admin-client") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM opportunity write helper must use shared Admin DB: ${helper}`);
  }
}


const crmSupportCasePage = read("apps/admin/app/admin/dashboard/crm/support/[id]/page.tsx");
if (
  !crmSupportCasePage.includes("@theouthaven/auth/admin-session")
  || !crmSupportCasePage.includes("@/lib/crm/support-case")
  || crmSupportCasePage.includes("@/lib/admin-auth")
  || crmSupportCasePage.includes("@/lib/crm/core-modules")
) {
  throw new Error("CRM support case page must use isolated Admin auth and support-case data helper.");
}
const crmSupportCaseActions = read("apps/admin/app/admin/dashboard/crm/support/[id]/actions.ts");
for (const dependency of [
  "@theouthaven/auth/admin-session",
  "@/lib/crm/support-tasks",
  "@/lib/support/replies",
  "@/lib/support/canonical",
  "@/lib/support/operations",
]) {
  if (!crmSupportCaseActions.includes(dependency)) {
    throw new Error(`CRM support case actions missing isolated dependency: ${dependency}`);
  }
}
for (const forbidden of [
  "@/lib/admin-auth",
  "@/lib/supabase-admin",
  "@/lib/support/cross-channel-sms",
  "@/lib/crm/tasks/service",
]) {
  if (crmSupportCaseActions.includes(forbidden)) {
    throw new Error(`CRM support case actions must not import root monolith dependency: ${forbidden}`);
  }
}
for (const helper of [
  "apps/admin/lib/crm/support-case.ts",
  "apps/admin/lib/crm/support-tasks.ts",
  "apps/admin/lib/support/replies.ts",
]) {
  const source = read(helper);
  if (!source.includes("@theouthaven/db/admin-client") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM support case helper must use shared Admin DB: ${helper}`);
  }
}
const supportTelnyx = read("apps/admin/lib/sms/telnyx.ts");
if (!supportTelnyx.includes("@/lib/aws/integration-api") || supportTelnyx.includes("@/lib/sms/telnyx")) {
  throw new Error("Isolated Admin support SMS helper must use AWS Integration API.");
}
const supportIntegrationApi = read("apps/admin/lib/aws/integration-api.ts");
if (!supportIntegrationApi.includes("sendTelnyxSmsViaIntegrationApi")) {
  throw new Error("Isolated Admin Integration API must expose Telnyx SMS delivery.");
}
const supportCoreApiCase = read("apps/admin/lib/aws/core-api.ts");
if (!supportCoreApiCase.includes("readSupportCaseViaCoreApi")) {
  throw new Error("Isolated Admin Core API must preserve support case reads.");
}


const crmMessagingPages = [
  "apps/admin/app/admin/dashboard/crm/notifications/page.tsx",
  "apps/admin/app/admin/dashboard/crm/communications/unmatched/page.tsx",
];
for (const route of crmMessagingPages) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session") || !source.includes("@theouthaven/db/admin-client")) {
    throw new Error(`CRM messaging page must use isolated Admin auth and shared Admin DB: ${route}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM messaging page must not import root monolith auth/DB: ${route}`);
  }
}
for (const actionFile of [
  "apps/admin/app/admin/dashboard/crm/notifications/actions.ts",
  "apps/admin/app/admin/dashboard/crm/communications/unmatched/actions.ts",
]) {
  const source = read(actionFile);
  if (!source.includes("@theouthaven/auth/admin-session") || !source.includes("@theouthaven/db/admin-client")) {
    throw new Error(`CRM messaging actions must use isolated Admin auth and shared Admin DB: ${actionFile}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM messaging actions must not import root monolith auth/DB: ${actionFile}`);
  }
}
const crmSmsReplyRoute = read("apps/admin/app/api/admin/crm/sms/reply/route.ts");
for (const dependency of [
  "@theouthaven/auth/admin-session",
  "@theouthaven/db/admin-client",
  "@/lib/sms/telnyx",
  "@/lib/crm/permissions",
]) {
  if (!crmSmsReplyRoute.includes(dependency)) {
    throw new Error(`CRM SMS reply route missing isolated dependency: ${dependency}`);
  }
}
if (
  crmSmsReplyRoute.includes("@/lib/admin-api-auth")
  || crmSmsReplyRoute.includes("@/lib/admin-permissions")
  || crmSmsReplyRoute.includes("@/lib/supabase-admin")
) {
  throw new Error("CRM SMS reply route must not import root monolith auth/DB helpers.");
}


const crmWorkQueuePages = [
  "apps/admin/app/admin/dashboard/crm/my-work/page.tsx",
  "apps/admin/app/admin/dashboard/crm/work-queue/new/page.tsx",
  "apps/admin/app/admin/dashboard/crm/work-queue/[taskId]/page.tsx",
];
for (const route of crmWorkQueuePages) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session")) {
    throw new Error(`CRM work queue page must use isolated Admin auth: ${route}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM work queue page must not import root monolith auth/DB modules: ${route}`);
  }
}
const crmWorkQueueActions = read("apps/admin/app/admin/dashboard/crm/work-queue/actions.ts");
if (!crmWorkQueueActions.includes("@theouthaven/auth/admin-session") || crmWorkQueueActions.includes("@/lib/admin-auth")) {
  throw new Error("CRM work queue actions must use isolated Admin auth.");
}
for (const helper of [
  "apps/admin/lib/crm/tasks/queries.ts",
  "apps/admin/lib/crm/tasks/service.ts",
  "apps/admin/lib/admin-organization-people.ts",
]) {
  const source = read(helper);
  if (!source.includes("@theouthaven/db/admin-client") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM work queue helper must use shared Admin DB: ${helper}`);
  }
}
const crmTaskTypes = read("apps/admin/lib/crm/tasks/types.ts");
const crmTaskValidation = read("apps/admin/lib/crm/tasks/validation.ts");
if (!crmTaskTypes.includes("@theouthaven/auth/admin-roles") || !crmTaskValidation.includes("@theouthaven/auth/admin-roles")) {
  throw new Error("CRM task role types must use isolated Admin role definitions.");
}
if (crmTaskValidation.includes('"experience"')) {
  throw new Error("CRM task validation must not preserve the legacy experience role.");
}

const crmLocationHealthPage = read("apps/admin/app/admin/dashboard/crm/location-health/page.tsx");
if (
  !crmLocationHealthPage.includes("@theouthaven/auth/admin-session")
  || !crmLocationHealthPage.includes("@/lib/crm/location-health-permissions")
  || crmLocationHealthPage.includes("@/lib/admin-auth")
  || crmLocationHealthPage.includes("@/lib/admin-permissions")
) {
  throw new Error("CRM Location Health page must use isolated Admin auth and role constants.");
}
const crmLocationHealthDuplicateSection = read("apps/admin/app/admin/dashboard/crm/location-health/DuplicateReviewSection.tsx");
if (
  !crmLocationHealthDuplicateSection.includes("@theouthaven/db/admin-client")
  || crmLocationHealthDuplicateSection.includes("@/lib/supabase-admin")
) {
  throw new Error("CRM Location Health duplicate section must use shared Admin DB.");
}
for (const route of [
  "apps/admin/app/api/admin/crm/location-health/route.ts",
  "apps/admin/app/api/admin/locations/duplicates/route.ts",
  "apps/admin/app/api/admin/locations/duplicates/summary/route.ts",
]) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session") || !source.includes("@theouthaven/db/admin-client")) {
    throw new Error(`Location Health API must use isolated Admin auth and shared Admin DB: ${route}`);
  }
  if (
    source.includes("@/lib/admin-api-auth")
    || source.includes("@/lib/admin-permissions")
    || source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Location Health API must not import root monolith auth/DB: ${route}`);
  }
}
const crmLocationHealthApi = read("apps/admin/app/api/admin/crm/location-health/route.ts");
if (
  !crmLocationHealthApi.includes("@/lib/aws/core-api")
  || !crmLocationHealthApi.includes('functions.invoke("location-health-runner"')
) {
  throw new Error("CRM Location Health API must preserve Core API reads and isolated repair invocation.");
}
const crmLocationHealthCoreApi = read("apps/admin/lib/aws/core-api.ts");
if (!crmLocationHealthCoreApi.includes("readCrmLocationHealthViaCoreApi")) {
  throw new Error("Isolated Admin Core API must expose CRM Location Health reads.");
}


const crmTodayCalendarPages = [
  "apps/admin/app/admin/dashboard/crm/today/page.tsx",
  "apps/admin/app/admin/dashboard/crm/calendar/page.tsx",
];
for (const route of crmTodayCalendarPages) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session") || !source.includes("@theouthaven/db/admin-client")) {
    throw new Error(`CRM Today/Calendar page must use isolated Admin auth and shared Admin DB: ${route}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/admin-permissions") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM Today/Calendar page must not import root monolith auth/DB helpers: ${route}`);
  }
}
const crmTodayUnreadMessages = read("apps/admin/components/admin/crm/TodayUnreadMessages.tsx");
if (!crmTodayUnreadMessages.includes("/api/admin/crm/communication-center?scope=crm")) {
  throw new Error("CRM Today unread messages must use the isolated communication-center feed.");
}
const crmCalendarCreator = read("apps/admin/components/admin/crm/CalendarEventCreator.tsx");
if (!crmCalendarCreator.includes("/api/admin/integrations/microsoft-365/calendar/events")) {
  throw new Error("CRM Calendar event creator must preserve isolated Microsoft 365 event creation.");
}
const crmCalendarEventRoute = read("apps/admin/app/api/admin/integrations/microsoft-365/calendar/events/route.ts");
if (!crmCalendarEventRoute.includes("@theouthaven/auth/admin-session") || crmCalendarEventRoute.includes("@/lib/admin-auth")) {
  throw new Error("CRM Calendar event route must use isolated Admin auth.");
}
const crmCalendarRuntime = read("apps/admin/lib/microsoft-365/calendar.ts");
if (!crmCalendarRuntime.includes("@theouthaven/db/admin-client") || crmCalendarRuntime.includes("@/lib/supabase-admin")) {
  throw new Error("CRM Calendar runtime must use shared Admin DB.");
}
const crmCommunicationCenterRoute = read("apps/admin/app/api/admin/crm/communication-center/route.ts");
for (const dependency of ["@theouthaven/auth/admin-session","@theouthaven/db/admin-client","@/lib/aws/core-api"]) {
  if (!crmCommunicationCenterRoute.includes(dependency)) throw new Error(`CRM communication center missing isolated dependency: ${dependency}`);
}
if (crmCommunicationCenterRoute.includes("@/lib/admin-auth") || crmCommunicationCenterRoute.includes("@/lib/admin-permissions") || crmCommunicationCenterRoute.includes("@/lib/supabase-admin")) {
  throw new Error("CRM communication center must not import root monolith auth/DB helpers.");
}
const crmTodayCalendarCoreApi = read("apps/admin/lib/aws/core-api.ts");
if (!crmTodayCalendarCoreApi.includes("readCrmCommunicationCenterViaCoreApi")) {
  throw new Error("Isolated Admin Core API must preserve CRM communication-center reads.");
}


const crmCallWorkspacePage = read("apps/admin/app/admin/dashboard/crm/[id]/call/page.tsx");
if (
  !crmCallWorkspacePage.includes("@theouthaven/auth/admin-session")
  || !crmCallWorkspacePage.includes("@theouthaven/db/admin-client")
  || !crmCallWorkspacePage.includes("@/lib/crm/permissions")
  || !crmCallWorkspacePage.includes("@/lib/integrations/three-cx")
) {
  throw new Error("CRM Call workspace must use isolated Admin auth, shared DB, CRM roles, and isolated 3CX helper.");
}
if (
  crmCallWorkspacePage.includes("@/lib/admin-auth")
  || crmCallWorkspacePage.includes("@/lib/admin-permissions")
  || crmCallWorkspacePage.includes("@/lib/supabase-admin")
) {
  throw new Error("CRM Call workspace must not import root monolith auth/DB helpers.");
}


const crmContactCreatePage = read("apps/admin/app/admin/dashboard/crm/contacts/new/page.tsx");
const crmContactCreateActions = read("apps/admin/app/admin/dashboard/crm/contacts/new/actions.ts");
if (!crmContactCreatePage.includes("@theouthaven/auth/admin-session") || crmContactCreatePage.includes("@/lib/admin-auth")) {
  throw new Error("CRM contact-create page must use isolated Admin auth.");
}
for (const dependency of ["@theouthaven/auth/admin-session","@theouthaven/db/admin-client","@/lib/sms/telnyx","@/lib/crm/permissions"]) {
  if (!crmContactCreateActions.includes(dependency)) throw new Error(`CRM contact-create action missing isolated dependency: ${dependency}`);
}
if (crmContactCreateActions.includes("@/lib/admin-auth") || crmContactCreateActions.includes("@/lib/supabase-admin")) {
  throw new Error("CRM contact-create action must not import root monolith auth/DB helpers.");
}

const crmCallsListPage = read("apps/admin/app/admin/dashboard/crm/calls/page.tsx");
if (
  !crmCallsListPage.includes("@theouthaven/auth/admin-session")
  || !crmCallsListPage.includes("@/lib/crm/calls")
  || crmCallsListPage.includes("@/lib/admin-auth")
  || crmCallsListPage.includes("@/lib/supabase-admin")
) {
  throw new Error("CRM Calls list must use isolated Admin auth and focused calls helper.");
}
const crmCallsListHelper = read("apps/admin/lib/crm/calls.ts");
if (
  !crmCallsListHelper.includes("@theouthaven/db/admin-client")
  || crmCallsListHelper.includes("@/lib/supabase-admin")
) {
  throw new Error("CRM Calls list helper must use shared Admin DB.");
}

const crmAccountsPages = [
  "apps/admin/app/admin/dashboard/crm/accounts/page.tsx",
  "apps/admin/app/admin/dashboard/crm/accounts/[id]/page.tsx",
];
for (const route of crmAccountsPages) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session")) {
    throw new Error(`CRM Accounts page must use isolated Admin auth: ${route}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM Accounts page must not import root monolith auth/DB modules: ${route}`);
  }
}
for (const helper of [
  "apps/admin/lib/crm/queries/account-summary.ts",
  "apps/admin/lib/crm/accounts.ts",
  "apps/admin/lib/organizations/admin-verification.ts",
]) {
  const source = read(helper);
  if (!source.includes("@theouthaven/db/admin-client") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`CRM Accounts helper must use shared Admin DB: ${helper}`);
  }
}
const crmAccountsActions = read("apps/admin/app/admin/dashboard/crm/accounts/actions.ts");
if (!crmAccountsActions.includes("@theouthaven/auth/admin-session") || crmAccountsActions.includes("@/lib/admin-auth")) {
  throw new Error("CRM Accounts actions must use isolated Admin auth.");
}
const crmVerificationQueue = read("apps/admin/components/admin/trust/VerificationQueue.tsx");
if (!crmVerificationQueue.includes("/api/admin/trust/verification")) {
  throw new Error("CRM Accounts verification queue must preserve the verification API workflow.");
}
const crmVerificationApi = read("apps/admin/app/api/admin/trust/verification/route.ts");
if (
  !crmVerificationApi.includes("@theouthaven/auth/admin-session")
  || !crmVerificationApi.includes("@theouthaven/db/admin-client")
  || crmVerificationApi.includes("@/lib/admin-api-auth")
  || crmVerificationApi.includes("@/lib/supabase-admin")
) {
  throw new Error("CRM Accounts verification API must use isolated Admin auth and shared Admin DB.");
}


const crmOutreachPage = read("apps/admin/app/admin/dashboard/crm/outreach/page.tsx");
if (
  !crmOutreachPage.includes("@theouthaven/auth/admin-session")
  || !crmOutreachPage.includes("@/lib/crm/outreach")
  || !crmOutreachPage.includes("@/lib/crm/location-outreach-communications")
  || crmOutreachPage.includes("@/lib/admin-auth")
  || crmOutreachPage.includes("@/lib/admin-permissions")
  || crmOutreachPage.includes("@/lib/crm/core-modules")
) {
  throw new Error("CRM Outreach page must use isolated Admin auth and focused CRM helpers.");
}
const crmOutreachHelper = read("apps/admin/lib/crm/outreach.ts");
if (!crmOutreachHelper.includes("@theouthaven/db/admin-client") || crmOutreachHelper.includes("@/lib/supabase-admin")) {
  throw new Error("CRM Outreach helper must use shared Admin DB.");
}
const crmLocationOutreach = read("apps/admin/lib/crm/location-outreach-communications.ts");
if (!crmLocationOutreach.includes("@theouthaven/db/admin-client") || crmLocationOutreach.includes("@/lib/supabase-admin")) {
  throw new Error("CRM location outreach helper must use shared Admin DB.");
}
const crmCommunicationCenter = read("apps/admin/components/admin/crm/CommunicationCenter.tsx");
if (!crmCommunicationCenter.includes("/api/admin/crm/communication-center")) {
  throw new Error("CRM CommunicationCenter must preserve isolated communication-center API usage.");
}


const crmRootPage = read("apps/admin/app/admin/dashboard/crm/page.tsx");
if (
  !crmRootPage.includes("@theouthaven/auth/admin-session")
  || !crmRootPage.includes("@/lib/crm/location-scope")
  || !crmRootPage.includes("@/lib/admin-crm")
  || crmRootPage.includes("@/lib/admin-auth")
  || crmRootPage.includes("@/lib/team-tools")
) {
  throw new Error("CRM root page must use isolated Admin auth, CRM runtime, and scoped location access.");
}
const crmLocationsPage = read("apps/admin/app/admin/dashboard/crm/locations/page.tsx");
if (!crmLocationsPage.includes("/admin/dashboard/crm/claims") || crmLocationsPage.includes("@/app/admin/claims/AdminClaimsPage")) {
  throw new Error("CRM locations route must reuse the isolated CRM claims workflow for pending claims.");
}
const crmRuntime = read("apps/admin/lib/admin-crm.ts");
if (!crmRuntime.includes("@theouthaven/db/admin-client") || crmRuntime.includes("@/lib/supabase-admin")) {
  throw new Error("Isolated CRM runtime must use the shared Admin DB boundary.");
}
const crmLocationScope = read("apps/admin/lib/crm/location-scope.ts");
if (!crmLocationScope.includes("@theouthaven/db/admin-client")) {
  throw new Error("CRM location scope must use shared Admin DB.");
}
for (const helper of [
  "apps/admin/lib/location-market-validation.ts",
  "apps/admin/lib/location-url.ts",
  "apps/admin/lib/location-growth/photoDetection.ts",
  "apps/admin/lib/location-growth/repairPhotoPublishability.ts",
  "apps/admin/lib/search/lowLevel.ts",
]) {
  const source = read(helper);
  if (source.includes("@/lib/supabase-admin") || source.includes("@/lib/admin-auth")) {
    throw new Error(`CRM isolated helper must not depend on root auth/DB modules: ${helper}`);
  }
}


const crmRootDashboardHelper = read("apps/admin/lib/crm/root-dashboard.ts");
if (
  !crmRootDashboardHelper.includes("@theouthaven/db/admin-client")
  || !crmRootDashboardHelper.includes("async function safeSelect")
  || crmRootDashboardHelper.includes("@/lib/supabase-admin")
) {
  throw new Error("CRM root dashboard helper must provide safe optional-table reads through shared Admin DB.");
}


const crmDetailPage = read("apps/admin/app/admin/dashboard/crm/[id]/page.tsx");
if (
  !crmDetailPage.includes("@theouthaven/auth/admin-session")
  || !crmDetailPage.includes("@theouthaven/db/admin-client")
  || crmDetailPage.includes("@/lib/admin-auth")
  || crmDetailPage.includes("@/lib/supabase-admin")
) {
  throw new Error("CRM detail page must use isolated Admin auth and shared Admin DB.");
}
for (const dependency of [
  "apps/admin/lib/team-tools.ts",
  "apps/admin/lib/growth-pro/data.ts",
  "apps/admin/lib/admin/location-intelligence.ts",
  "apps/admin/lib/locations/menu.ts",
]) {
  const source = read(dependency);
  if (source.includes("@/lib/supabase-admin") || source.includes("@/lib/admin-auth")) {
    throw new Error(`CRM detail dependency must not import root monolith auth/DB modules: ${dependency}`);
  }
}
if (!read("apps/admin/lib/team-tools.ts").includes("@theouthaven/db/admin-client")) {
  throw new Error("CRM detail team-tools helper must use shared Admin DB.");
}
if (!read("apps/admin/lib/growth-pro/data.ts").includes("@theouthaven/db/admin-client")) {
  throw new Error("CRM detail Growth Pro helper must use shared Admin DB.");
}
if (!read("apps/admin/lib/locations/menu.ts").includes("@theouthaven/db/admin-client")) {
  throw new Error("CRM detail menu helper must use shared Admin DB.");
}


const crmFinalDetailPage = read("apps/admin/app/admin/dashboard/crm/[id]/page.tsx");
if (
  !crmFinalDetailPage.includes("@theouthaven/auth/admin-session")
  || !crmFinalDetailPage.includes("@theouthaven/db/admin-client")
  || crmFinalDetailPage.includes("@/lib/admin-auth")
  || crmFinalDetailPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Final CRM detail page must use isolated Admin auth and shared Admin DB.");
}
for (const dependency of [
  "apps/admin/app/admin/dashboard/crm/[id]/CommunicationPanel.tsx",
  "apps/admin/app/admin/dashboard/crm/[id]/PhotosPanel.tsx",
  "apps/admin/app/admin/dashboard/crm/[id]/ReservationPanel.tsx",
  "apps/admin/app/admin/dashboard/crm/[id]/ListingEnhancementEditor.tsx",
  "apps/admin/components/admin/LocationHoursEditor.tsx",
  "apps/admin/components/admin/LocationProfileEditor.tsx",
  "apps/admin/components/admin/location-workspace/LocationWorkspaceNavigation.tsx",
  "apps/admin/lib/growth-pro/data.ts",
  "apps/admin/lib/locations/menu.ts",
  "apps/admin/lib/team-tools.ts",
  "apps/admin/lib/admin/location-intelligence.ts",
  "apps/admin/lib/admin/location-qr-status.ts",
]) {
  const source = read(dependency);
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`Final CRM detail dependency must not import root Admin auth/DB modules: ${dependency}`);
  }
}


const marketingCalendarPage = read("apps/admin/app/admin/dashboard/marketing/calendar/page.tsx");
if (
  !marketingCalendarPage.includes("@theouthaven/auth/admin-session")
  || !marketingCalendarPage.includes("@theouthaven/db/admin-client")
  || marketingCalendarPage.includes("@/lib/admin-auth")
  || marketingCalendarPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing Calendar must use isolated Admin auth and shared Admin DB.");
}
const marketingSettingsPage = read("apps/admin/app/admin/dashboard/marketing/settings/page.tsx");
if (
  !marketingSettingsPage.includes("@theouthaven/auth/admin-session")
  || !marketingSettingsPage.includes("@theouthaven/db/admin-client")
  || marketingSettingsPage.includes("@/lib/admin-auth")
  || marketingSettingsPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing Settings must use isolated Admin auth and shared Admin DB.");
}
const marketingSettingsApi = read("apps/admin/app/api/admin/marketing/settings/route.ts");
if (
  !marketingSettingsApi.includes("@theouthaven/db/admin-client")
  || marketingSettingsApi.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing Settings API must use shared Admin DB.");
}
const isolatedMarketingAdmin = read("apps/admin/lib/marketing-admin.ts");
if (
  !isolatedMarketingAdmin.includes("@theouthaven/db/admin-client")
  || isolatedMarketingAdmin.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing Admin helper must use shared Admin DB.");
}


for (const route of [
  "apps/admin/app/admin/dashboard/marketing/promotions/page.tsx",
  "apps/admin/app/admin/dashboard/marketing/discover/page.tsx",
]) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session") || source.includes("@/lib/admin-auth")) {
    throw new Error(`Marketing page must use isolated Admin auth: ${route}`);
  }
}
for (const route of [
  "apps/admin/app/api/admin/marketing/promotions/route.ts",
  "apps/admin/app/api/admin/marketing/discover/route.ts",
]) {
  const source = read(route);
  if (!source.includes("@theouthaven/db/admin-client") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`Marketing API must use shared Admin DB: ${route}`);
  }
  if (!source.includes("@/lib/marketing-admin")) {
    throw new Error(`Marketing API must preserve Marketing authorization helper: ${route}`);
  }
}
const marketingPromotionsClient = read("apps/admin/app/admin/dashboard/marketing/promotions/PromotionsAdminClient.tsx");
if (!marketingPromotionsClient.includes("/api/admin/marketing/promotions")) {
  throw new Error("Marketing Promotions client must preserve protected API usage.");
}
const marketingDiscoverClient = read("apps/admin/app/admin/dashboard/marketing/discover/DiscoverMerchandisingClient.tsx");
if (!marketingDiscoverClient.includes("/api/admin/marketing/discover")) {
  throw new Error("Marketing Discover client must preserve protected API usage.");
}


const marketingSimpleReadPages = [
  "apps/admin/app/admin/dashboard/marketing/featured-outings/page.tsx",
  "apps/admin/app/admin/dashboard/marketing/media/page.tsx",
  "apps/admin/app/admin/dashboard/marketing/approvals/page.tsx",
];
for (const route of marketingSimpleReadPages) {
  const source = read(route);
  if (
    !source.includes("@theouthaven/auth/admin-session")
    || !source.includes("@theouthaven/db/admin-client")
    || source.includes("@/lib/admin-auth")
    || source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Marketing read page must use isolated Admin auth and shared Admin DB: ${route}`);
  }
}


const marketingFoundationUniquePages = [
  "apps/admin/app/admin/dashboard/marketing/content/new/page.tsx",
  "apps/admin/app/admin/dashboard/marketing/content/[id]/page.tsx",
  "apps/admin/app/admin/dashboard/marketing/social-manager/weekly-plan/page.tsx",
];
for (const route of marketingFoundationUniquePages) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session")) {
    throw new Error(`Marketing foundation page must use isolated Admin auth: ${route}`);
  }
  if (source.includes("@/lib/admin-auth") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`Marketing foundation page must not import root monolith auth/DB modules: ${route}`);
  }
}
const marketingContentOperations = read("apps/admin/lib/marketing/content-operations.ts");
if (
  !marketingContentOperations.includes("@theouthaven/db/admin-client")
  || marketingContentOperations.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing content operations must use shared Admin DB.");
}
for (const dependency of [
  "apps/admin/components/marketing/MarketingContentEditor.tsx",
  "apps/admin/components/marketing/MarketingPublishNowButton.tsx",
]) {
  read(dependency);
}


const marketingTodayAnalyticsPages = [
  "apps/admin/app/admin/dashboard/marketing/today/page.tsx",
  "apps/admin/app/admin/dashboard/marketing/analytics/page.tsx",
];
for (const route of marketingTodayAnalyticsPages) {
  const source = read(route);
  if (
    !source.includes("@theouthaven/auth/admin-session")
    || !source.includes("@theouthaven/db/admin-client")
    || source.includes("@/lib/admin-auth")
    || source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Marketing Today/Analytics page must use isolated Admin auth and shared Admin DB: ${route}`);
  }
}


const marketingContentPipelinePage = read("apps/admin/app/admin/dashboard/marketing/content/page.tsx");
if (
  !marketingContentPipelinePage.includes("@theouthaven/auth/admin-session")
  || !marketingContentPipelinePage.includes("@theouthaven/db/admin-client")
  || marketingContentPipelinePage.includes("@/lib/admin-auth")
  || marketingContentPipelinePage.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing Content Pipeline must use isolated Admin auth and shared Admin DB.");
}


const marketingCreatorsGrowthPages = [
  "apps/admin/app/admin/dashboard/marketing/creators/page.tsx",
  "apps/admin/app/admin/dashboard/marketing/growth/page.tsx",
];
for (const route of marketingCreatorsGrowthPages) {
  const source = read(route);
  if (
    !source.includes("@theouthaven/auth/admin-session")
    || !source.includes("@theouthaven/db/admin-client")
    || source.includes("@/lib/admin-auth")
    || source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Marketing Creators/Growth page must use isolated Admin auth and shared Admin DB: ${route}`);
  }
}
const creatorPartnershipApi = read("apps/admin/app/api/admin/marketing/creators/partnership/route.ts");
if (
  !creatorPartnershipApi.includes("@theouthaven/auth/admin-session")
  || !creatorPartnershipApi.includes("@theouthaven/db/admin-client")
  || creatorPartnershipApi.includes("@/lib/admin-auth")
  || creatorPartnershipApi.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing creator partnership API must use isolated Admin auth and shared Admin DB.");
}


const marketingPostcardFollowupPage = read("apps/admin/app/admin/dashboard/marketing/postcard-followups/[locationId]/page.tsx");
if (
  !marketingPostcardFollowupPage.includes("@theouthaven/auth/admin-session")
  || !marketingPostcardFollowupPage.includes("@theouthaven/db/admin-client")
  || marketingPostcardFollowupPage.includes("@/lib/admin-auth")
  || marketingPostcardFollowupPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing postcard follow-up page must use isolated Admin auth and shared Admin DB.");
}
const marketingPostcardFollowupForm = read("apps/admin/components/marketing/PostcardSocialFollowupForm.tsx");
if (!marketingPostcardFollowupForm.includes("/api/admin/marketing/postcard-followups/")) {
  throw new Error("Marketing postcard follow-up form must preserve the isolated postcard follow-up API.");
}
const marketingPostcardFollowupApi = read("apps/admin/app/api/admin/marketing/postcard-followups/[locationId]/route.ts");
if (
  !marketingPostcardFollowupApi.includes("@theouthaven/db/admin-client")
  || !marketingPostcardFollowupApi.includes("@/lib/admin-api-auth")
  || !marketingPostcardFollowupApi.includes("@/lib/crm/tasks/service")
  || marketingPostcardFollowupApi.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing postcard follow-up API must use isolated Admin API auth, shared Admin DB, and isolated task service.");
}


const marketingOpportunitiesPage = read("apps/admin/app/admin/dashboard/marketing/opportunities/page.tsx");
if (
  !marketingOpportunitiesPage.includes("@theouthaven/auth/admin-session")
  || !marketingOpportunitiesPage.includes("@theouthaven/db/admin-client")
  || marketingOpportunitiesPage.includes("@/lib/admin-auth")
  || marketingOpportunitiesPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing opportunities page must use isolated Admin auth and shared Admin DB.");
}
const marketingOpportunitiesHelper = read("apps/admin/lib/marketing/opportunities.ts");
if (
  !marketingOpportunitiesHelper.includes("@theouthaven/db/admin-client")
  || marketingOpportunitiesHelper.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing opportunities helper must use shared Admin DB.");
}
const marketingOpportunityApi = read("apps/admin/app/api/admin/marketing/opportunities/[id]/feature/route.ts");
if (
  !marketingOpportunityApi.includes("@/lib/admin-api-auth")
  || !marketingOpportunityApi.includes("@/lib/marketing/opportunities")
) {
  throw new Error("Marketing opportunities feature API must preserve isolated Admin API auth and opportunity helper.");
}


const marketingContentReviewPage = read("apps/admin/app/admin/dashboard/marketing/content/[id]/review/page.tsx");
if (
  !marketingContentReviewPage.includes("@theouthaven/auth/admin-session")
  || !marketingContentReviewPage.includes("@theouthaven/db/admin-client")
  || !marketingContentReviewPage.includes("@/lib/marketing/content-operations")
  || marketingContentReviewPage.includes("@/lib/admin-auth")
  || marketingContentReviewPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing content review page must use isolated Admin auth, shared Admin DB, and isolated content operations.");
}
const marketingApprovalClient = read("apps/admin/components/marketing/MarketingApprovalActions.tsx");
if (!marketingApprovalClient.includes("/api/admin/marketing/content/")) {
  throw new Error("Marketing approval client must preserve the isolated approval API target.");
}
const marketingApprovalApi = read("apps/admin/app/api/admin/marketing/content/[id]/approval/route.ts");
if (
  !marketingApprovalApi.includes("@theouthaven/auth/admin-session")
  || !marketingApprovalApi.includes("@/lib/marketing/content-operations")
  || marketingApprovalApi.includes("@/lib/admin-api-auth")
  || marketingApprovalApi.includes("@/lib/admin-auth")
  || marketingApprovalApi.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing approval API must use isolated Admin auth and isolated content operations.");
}


const marketingSocialManagerCorePages = [
  "apps/admin/app/admin/dashboard/marketing/community/page.tsx",
  "apps/admin/app/admin/dashboard/marketing/social-manager/page.tsx",
  "apps/admin/app/admin/dashboard/marketing/social-manager/settings/page.tsx",
];
for (const route of marketingSocialManagerCorePages) {
  const source = read(route);
  if (
    !source.includes("@theouthaven/auth/admin-session")
    || !source.includes("@theouthaven/db/admin-client")
    || source.includes("@/lib/admin-auth")
    || source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Marketing Social Manager page must use isolated Admin auth and shared Admin DB: ${route}`);
  }
}
for (const helper of [
  "apps/admin/lib/marketing/social-manager.ts",
  "apps/admin/lib/marketing/social-community-provider.ts",
]) {
  const source = read(helper);
  if (!source.includes("@theouthaven/db/admin-client") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`Marketing Social Manager helper must use shared Admin DB: ${helper}`);
  }
}
const socialCommunityProvider = read("apps/admin/lib/marketing/social-community-provider.ts");
if (!socialCommunityProvider.includes("@/lib/marketing/social-secrets")) {
  throw new Error("Marketing social community provider must preserve isolated social secrets access.");
}
for (const route of [
  "apps/admin/app/api/admin/marketing/community/reply/route.ts",
  "apps/admin/app/api/admin/marketing/community/take-over/route.ts",
  "apps/admin/app/api/admin/marketing/community/close/route.ts",
  "apps/admin/app/api/admin/marketing/community/settings/route.ts",
]) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session") || source.includes("@/lib/admin-auth") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`Marketing community API must use isolated Admin auth and no root monolith DB: ${route}`);
  }
}
const communityReplyRoute = read("apps/admin/app/api/admin/marketing/community/reply/route.ts");
if (!communityReplyRoute.includes("@/lib/marketing/social-community-provider")) {
  throw new Error("Marketing community reply API must preserve the isolated provider delivery path.");
}


const marketingSocialAccountsPage = read("apps/admin/app/admin/dashboard/marketing/social-accounts/page.tsx");
if (
  !marketingSocialAccountsPage.includes("@theouthaven/auth/admin-session")
  || !marketingSocialAccountsPage.includes("@theouthaven/db/admin-client")
  || !marketingSocialAccountsPage.includes("@/lib/marketing/social-oauth")
  || marketingSocialAccountsPage.includes("@/lib/admin-auth")
  || marketingSocialAccountsPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing Social Accounts page must use isolated Admin auth, shared Admin DB, and isolated Social OAuth.");
}
const socialConnectionActions = read("apps/admin/components/marketing/SocialConnectionActions.tsx");
if (
  !socialConnectionActions.includes("/api/admin/marketing/social/oauth/")
  || !socialConnectionActions.includes("/api/admin/marketing/social/connections/")
) {
  throw new Error("Marketing Social Accounts actions must preserve isolated OAuth and disconnect API targets.");
}
const marketingSocialOauth = read("apps/admin/lib/marketing/social-oauth.ts");
if (
  !marketingSocialOauth.includes("@theouthaven/db/admin-client")
  || !marketingSocialOauth.includes("./social-secrets")
  || marketingSocialOauth.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing Social OAuth helper must use shared Admin DB and isolated social secret storage.");
}
for (const route of [
  "apps/admin/app/api/admin/marketing/social/connections/[id]/route.ts",
  "apps/admin/app/api/admin/marketing/social/oauth/[provider]/route.ts",
  "apps/admin/app/api/admin/marketing/social/oauth/[provider]/callback/route.ts",
]) {
  const source = read(route);
  if (
    !source.includes("@theouthaven/auth/admin-session")
    || source.includes("@/lib/admin-api-auth")
    || source.includes("@/lib/admin-auth")
    || source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Marketing Social Accounts API must use isolated Admin auth and no root monolith DB: ${route}`);
  }
}


const marketingCenterPage = read("apps/admin/app/admin/dashboard/marketing/page.tsx");
if (
  !marketingCenterPage.includes("@theouthaven/auth/admin-session")
  || !marketingCenterPage.includes("@theouthaven/db/admin-client")
  || marketingCenterPage.includes("@/lib/admin-auth")
  || marketingCenterPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing Center page must use isolated Admin auth and shared Admin DB.");
}

for (const route of [
  "apps/admin/app/api/admin/marketing/campaigns/route.ts",
  "apps/admin/app/api/admin/marketing/campaigns/[id]/route.ts",
]) {
  const source = read(route);
  if (
    !source.includes("@theouthaven/db/admin-client")
    || source.includes("@/lib/supabase-admin")
  ) {
    throw new Error(`Marketing campaign API must use shared Admin DB: ${route}`);
  }
}

const marketingPublicHelper = read("apps/admin/lib/marketing-public.ts");
if (
  !marketingPublicHelper.includes("@theouthaven/db/admin-client")
  || marketingPublicHelper.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing public helper must use shared Admin DB.");
}

const marketingReportsPage = read("apps/admin/app/admin/dashboard/marketing/reports/page.tsx");
if (
  !marketingReportsPage.includes("@theouthaven/auth/admin-session")
  || !marketingReportsPage.includes("@theouthaven/db/admin-client")
  || marketingReportsPage.includes("@/lib/admin-auth")
  || marketingReportsPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing Reports page must use isolated Admin auth and shared Admin DB.");
}

const marketingReportEngine = read("apps/admin/lib/admin/marketing-report-engine.ts");
if (
  !marketingReportEngine.includes("@theouthaven/db/admin-client")
  || marketingReportEngine.includes("@/lib/supabase-admin")
) {
  throw new Error("Marketing report engine must use shared Admin DB.");
}

const marketingReportsApi = read("apps/admin/app/api/admin/marketing/reports/route.ts");
if (
  !marketingReportsApi.includes("@theouthaven/auth/admin-session")
  || !marketingReportsApi.includes("@theouthaven/db/admin-client")
  || !marketingReportsApi.includes("@/lib/aws/integration-api")
  || marketingReportsApi.includes("@/lib/admin-auth")
  || marketingReportsApi.includes("@/lib/supabase-admin")
  || marketingReportsApi.includes("@/lib/resend")
) {
  throw new Error("Marketing reports API must use isolated Admin auth/DB and AWS Integration email.");
}


const locationsNonSearchablePage = read("apps/admin/app/admin/dashboard/locations/non-searchable/page.tsx");
if (
  !locationsNonSearchablePage.includes("@theouthaven/auth/admin-session")
  || !locationsNonSearchablePage.includes("@theouthaven/db/admin-client")
  || locationsNonSearchablePage.includes("@/lib/admin-auth")
  || locationsNonSearchablePage.includes("@/lib/supabase-admin")
) {
  throw new Error("Non-searchable Locations page must use isolated Admin auth and shared Admin DB.");
}

const locationsPublishabilityApi = read("apps/admin/app/api/admin/locations/repair-publishability/route.ts");
if (
  !locationsPublishabilityApi.includes("@theouthaven/db/admin-client")
  || locationsPublishabilityApi.includes("@/lib/supabase-admin")
) {
  throw new Error("Location publishability repair API must use shared Admin DB.");
}

for (const helper of [
  "apps/admin/lib/location-growth/repairAllPublishability.ts",
  "apps/admin/lib/google/google-places-cost-control.ts",
]) {
  const source = read(helper);
  if (!source.includes("@theouthaven/db/admin-client") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`Location repair helper must use shared Admin DB: ${helper}`);
  }
}

const locationsGooglePlacesClient = read("apps/admin/lib/google/places-new-client.ts");
if (
  !locationsGooglePlacesClient.includes("@/lib/aws/integration-api")
  || !locationsGooglePlacesClient.includes("@/lib/google/google-places-cost-control")
) {
  throw new Error("Isolated Google Places client must preserve Integration API and cost-control boundaries.");
}

for (const route of [
  "apps/admin/app/admin/dashboard/locations/duplicates/page.tsx",
  "apps/admin/app/admin/dashboard/locations/import/page.tsx",
]) {
  const source = read(route);
  if (!source.includes("next/navigation")) {
    throw new Error(`Locations redirect must remain inside isolated Admin app: ${route}`);
  }
}


const isolatedLocationsPage = read("apps/admin/app/admin/dashboard/locations/page.tsx");
if (
  !isolatedLocationsPage.includes("@theouthaven/auth/admin-session") ||
  !isolatedLocationsPage.includes("@theouthaven/db/admin-client") ||
  isolatedLocationsPage.includes("@/lib/admin-auth") ||
  isolatedLocationsPage.includes("@/lib/supabase")
) {
  throw new Error("Locations command center must use isolated Admin auth and DB.");
}

const isolatedLocationDetail = read("apps/admin/app/admin/dashboard/locations/id/[locationId]/page.tsx");
if (
  !isolatedLocationDetail.includes("@theouthaven/auth/admin-session") ||
  !isolatedLocationDetail.includes("@theouthaven/db/admin-client")
) {
  throw new Error("Location detail must use isolated Admin auth and DB.");
}

const isolatedLocationSearch = read("apps/admin/app/api/admin/search-locations/route.ts");
if (
  !isolatedLocationSearch.includes("@theouthaven/db/admin-client") ||
  isolatedLocationSearch.includes("@/lib/supabase-admin")
) {
  throw new Error("Location search API must use shared Admin DB.");
}

if (!adminNavigation.includes("/admin/dashboard/locations")) {
  throw new Error("Locations navigation must be present in isolated Admin shell.");
}


const knowledgeBasePage = read("apps/admin/app/admin/dashboard/knowledge-base/page.tsx");
if (!knowledgeBasePage.includes("@theouthaven/auth/admin-session") || !knowledgeBasePage.includes("@/lib/knowledge-base/server")) {
  throw new Error("Knowledge Base must use isolated Admin auth and local runtime.");
}
for (const kbRuntime of [
  "apps/admin/lib/knowledge-base/server.ts",
  "apps/admin/lib/knowledge-base/access.ts",
  "apps/admin/lib/knowledge-base/types.ts",
  "apps/admin/lib/knowledge-base/render.ts",
]) {
  const source = read(kbRuntime);
  if (source.includes("@/lib/supabase-admin") || source.includes("@/lib/admin-auth")) {
    throw new Error(`Knowledge Base runtime must not import root monolith modules: ${kbRuntime}`);
  }
}
if (!read("apps/admin/lib/knowledge-base/server.ts").includes("@theouthaven/db/admin-client")) {
  throw new Error("Knowledge Base must use isolated Admin auth and shared DB.");
}
for (const kbRoute of [
  "apps/admin/app/api/admin/knowledge-base/articles/route.ts",
  "apps/admin/app/api/admin/knowledge-base/articles/[id]/route.ts",
  "apps/admin/app/api/admin/knowledge-base/categories/route.ts",
  "apps/admin/app/api/admin/knowledge-base/templates/render/route.ts",
  "apps/admin/app/api/admin/knowledge-base/ai/route.ts",
]) {
  const source = read(kbRoute);
  if (!source.includes("@/lib/admin-api-auth") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`Knowledge Base API must use isolated auth/DB boundaries: ${kbRoute}`);
  }
}
if (!adminNavigation.includes("/admin/dashboard/knowledge-base")) {
  throw new Error("Knowledge Base navigation must be present in isolated Admin shell.");
}


const mailingBatchesPage = read("apps/admin/app/admin/dashboard/operations/mailing-batches/page.tsx");
if (
  !mailingBatchesPage.includes("@theouthaven/auth/admin-session") ||
  !mailingBatchesPage.includes("@theouthaven/db/admin-client") ||
  mailingBatchesPage.includes("@/lib/admin-auth") ||
  mailingBatchesPage.includes("@/lib/supabase-admin")
) {
  throw new Error("Mailing Batches page must use isolated Admin auth and shared DB.");
}

for (const postcardRoute of [
  "apps/admin/app/api/admin/mailing-batches/route.ts",
  "apps/admin/app/api/admin/mailing-batches/[id]/status/route.ts",
  "apps/admin/app/api/admin/mailing-batches/postcard-template/route.ts",
  "apps/admin/app/api/admin/mailing-batches/[id]/postage/preview/route.ts",
  "apps/admin/app/api/admin/mailing-batches/[id]/postage/staging-proof/route.ts",
  "apps/admin/app/api/admin/mailing-batches/[id]/postage/production-proof/route.ts",
]) {
  const source = read(postcardRoute);
  if (source.includes("@/lib/supabase-admin") || source.includes("@/lib/admin-auth")) {
    throw new Error(`Postcard Admin route must not import root monolith auth/database modules: ${postcardRoute}`);
  }
}

const postcardProductionProof = read("apps/admin/app/api/admin/mailing-batches/[id]/postage/production-proof/route.ts");
for (const guard of [
  "createStampsPostcardProductionProofViaIntegrationApi",
  "getStampsStatusViaIntegrationApi",
  'stamps_postage_status: "reserved"',
  '.is("stamps_postage_status", null)',
  'stamps_postage_status: "manual_review"',
  "This live attempt will not be retried automatically.",
]) {
  if (!postcardProductionProof.includes(guard)) {
    throw new Error(`Postcard production proof must preserve AWS-only live postage safety: ${guard}`);
  }
}

const stampsRuntime = read("apps/admin/lib/stamps-postcard.ts");
if (!stampsRuntime.includes("Stamps.com production SOAP calls must run through the AWS Integration API.")) {
  throw new Error("Postcard direct SOAP runtime must fail closed for live production traffic.");
}

const postcardPrintPage = read("apps/admin/app/admin/dashboard/operations/mailing-batches/[id]/print/page.tsx");
for (const guard of ["stamps_postage_status !== \"purchased\"", "productionBatch", "Do not purchase"]) {
  if (!postcardPrintPage.includes(guard)) {
    throw new Error(`Postcard print center must preserve purchased-postage fail-closed guard: ${guard}`);
  }
}

if (!adminNavigation.includes("/admin/dashboard/operations/mailing-batches")) {
  throw new Error("Mailing Batches navigation must be present in isolated Admin shell.");
}


const reservationOpportunitiesPage = read("apps/admin/app/admin/dashboard/reservation-opportunities/page.tsx");
const reservationOpportunitiesApi = read("apps/admin/app/api/admin/reservation-opportunities/route.ts");
if (
  !reservationOpportunitiesPage.includes("@theouthaven/auth/admin-session")
  || !reservationOpportunitiesApi.includes("@theouthaven/db/admin-client")
  || reservationOpportunitiesApi.includes("@/lib/supabase-admin")
  || reservationOpportunitiesApi.includes("@/lib/admin-auth")
) {
  throw new Error("Reservation Opportunities must use isolated Admin auth and shared Admin DB.");
}

const adminLocationLayoutBoundary = read("apps/admin/app/admin/dashboard/location-layout/create/page.tsx");
if (
  !adminLocationLayoutBoundary.includes("NEXT_PUBLIC_RESERVE_APP_URL")
  || !adminLocationLayoutBoundary.includes("/dashboard/location-layout/create")
  || adminLocationLayoutBoundary.includes("LocationLayoutClient")
) {
  throw new Error("Admin location layout must remain a boundary link; Reserve-specific layout runtime stays in the separate Reserve system.");
}

const trustPage = read("apps/admin/app/admin/dashboard/trust/page.tsx");
const trustApi = read("apps/admin/app/api/admin/trust/verification/route.ts");
if (
  !trustPage.includes("@theouthaven/auth/admin-session")
  || !trustPage.includes("VerificationWork")
  || !trustApi.includes("@theouthaven/auth/admin-session")
  || !trustApi.includes("@theouthaven/db/admin-client")
) {
  throw new Error("Trust and Verification must remain fully isolated in the Admin app.");
}

const fraudPage = read("apps/admin/app/admin/dashboard/fraud/page.tsx");
const fraudActions = read("apps/admin/app/admin/dashboard/fraud/actions.ts");
const fraudRuntime = read("apps/admin/lib/fraud.ts");
for (const [label, source] of [["page", fraudPage], ["actions", fraudActions]]) {
  if (!source.includes("@theouthaven/auth/admin-session") || !source.includes("@theouthaven/db/admin-client") || source.includes("@/lib/supabase-admin")) {
    throw new Error(`Fraud ${label} must use isolated Admin auth and shared DB.`);
  }
}
if (!fraudRuntime.includes("@theouthaven/db/admin-client") || fraudRuntime.includes("@/lib/supabase-admin")) {
  throw new Error("Fraud decision runtime must use shared Admin DB.");
}

const giveawayRetiredPage = read("apps/admin/app/admin/dashboard/giveaway/page.tsx");
if (!giveawayRetiredPage.includes("Giveaway has been retired") || giveawayRetiredPage.includes("/api/admin/giveaway/")) {
  throw new Error("Cancelled Giveaway functionality must stay retired rather than being migrated into isolated Admin.");
}

const supportTail = read("apps/admin/app/admin/dashboard/support/page.tsx");
const communicationTail = read("apps/admin/app/admin/dashboard/communication/page.tsx");
if (!supportTail.includes('redirect("/admin/dashboard/crm/support")')) {
  throw new Error("Support tail must route to isolated CRM Support.");
}
if (!communicationTail.includes('redirect("/admin/dashboard/crm/operations?view=communication-center")')) {
  throw new Error("Communication tail must route to isolated CRM Operations.");
}

const careersDetail = read("apps/admin/app/admin/dashboard/careers/applications/[id]/page.tsx");
if (
  !careersDetail.includes("@theouthaven/auth/admin-session")
  || !careersDetail.includes("@theouthaven/db/admin-client")
  || !careersDetail.includes("HiringWorkflow")
) {
  throw new Error("Careers application detail must use isolated Admin auth/DB and preserve structured hiring workflow.");
}
for (const route of [
  "apps/admin/app/api/admin/careers/applications/[id]/workflow/route.ts",
  "apps/admin/app/api/admin/careers/applications/[id]/scorecard/route.ts",
  "apps/admin/app/api/admin/careers/applications/[id]/schedule-interview/route.ts",
  "apps/admin/app/api/admin/careers/applications/[id]/interview-session/route.ts",
]) {
  const source = read(route);
  if (!source.includes("@theouthaven/auth/admin-session") || !source.includes("@theouthaven/db/admin-client") || source.includes("@/lib/supabase-admin") || source.includes("@/lib/admin-auth")) {
    throw new Error(`Careers detail API must use isolated Admin boundaries: ${route}`);
  }
}

const eventModerationPage = read("apps/admin/app/admin/dashboard/events-experiences/moderation/page.tsx");
const eventModerationActions = read("apps/admin/app/admin/dashboard/events-experiences/moderation/actions.ts");
if (
  !eventModerationPage.includes("@theouthaven/auth/admin-session")
  || !eventModerationPage.includes("@theouthaven/db/admin-client")
  || !eventModerationActions.includes("fraudDecisionPreventsSensitiveAction")
  || !eventModerationActions.includes("getFraudDecision")
  || !eventModerationActions.includes("stripe_connect_charges_enabled")
  || !eventModerationActions.includes("stripe_connect_payouts_enabled")
  || !eventModerationActions.includes("@/lib/email/send")
  || eventModerationActions.includes("@/lib/supabase-admin")
) {
  throw new Error("Events moderation must preserve fraud, payout, publication, notification, and isolated Admin boundaries.");
}

const searchHealthBatch = read("apps/admin/app/api/admin/search-health/batch-run/route.ts");
const searchHealthTrend = read("apps/admin/app/api/admin/search-health/trend/route.ts");
const searchHealthTest = read("apps/admin/app/api/admin/search-health/test-event/route.ts");
const searchHealthQaPrompts = read("apps/admin/app/api/admin/search-health/qa-prompts/route.ts");
if (
  !searchHealthBatch.includes("CONSUMER_APP_ORIGIN")
  || !searchHealthBatch.includes("/api/generate")
  || !searchHealthTrend.includes("@theouthaven/db/admin-client")
  || !searchHealthTest.includes("@theouthaven/db/admin-client")
  || !searchHealthQaPrompts.includes("@/lib/search/enterprise/qa-prompts")
) {
  throw new Error("Search Health tail must preserve isolated Admin data access and canonical consumer search service boundary.");
}

const teamDemoDetail = read("apps/admin/app/admin/dashboard/team/demo/[sessionId]/reservations/page.tsx");
if (
  !teamDemoDetail.includes("@theouthaven/auth/admin-session")
  || !teamDemoDetail.includes("@theouthaven/db/admin-client")
  || teamDemoDetail.includes("@/lib/supabase-admin")
) {
  throw new Error("Team demo detail must use isolated Admin auth and shared DB.");
}

for (const href of [
  "/admin/dashboard/reservation-opportunities",
  "/admin/dashboard/trust",
  "/admin/dashboard/fraud",
  "/admin/dashboard/search-health",
]) {
  if (!adminNavigation.includes(href)) throw new Error(`Missing final isolated Admin navigation entry: ${href}`);
}

console.log("Final Admin tail isolation regression passed.");
