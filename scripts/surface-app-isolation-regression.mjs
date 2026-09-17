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

const seoPage = read("apps/admin/app/admin/dashboard/seo/page.tsx");
if (!seoPage.includes("@theouthaven/auth/admin-session") || !seoPage.includes("./SeoOperationsClient")) {
  throw new Error("SEO Operations page must use isolated Admin auth and local client UI.");
}
if (!seoPage.includes('["superadmin", "admin", "editor", "viewer"]')) {
  throw new Error("SEO Operations page must preserve the existing view-role boundary.");
}

const seoClient = read("apps/admin/app/admin/dashboard/seo/SeoOperationsClient.tsx");
for (const endpoint of ["/api/admin/seo/runs", "/api/admin/seo/issues", "/api/admin/seo/inspect", "/api/admin/seo/audit"]) {
  if (!seoClient.includes(endpoint)) {
    throw new Error(`SEO Operations client must use isolated endpoint: ${endpoint}`);
  }
}

for (const seoRoute of [
  "apps/admin/app/api/admin/seo/runs/route.ts",
  "apps/admin/app/api/admin/seo/issues/route.ts",
  "apps/admin/app/api/admin/seo/inspect/route.ts",
  "apps/admin/app/api/admin/seo/audit/route.ts",
]) {
  const source = read(seoRoute);
  if (!source.includes("@/lib/admin-api-auth")) {
    throw new Error(`SEO API must use isolated Admin API auth: ${seoRoute}`);
  }
  if (source.includes("@/lib/supabase-admin") || source.includes("@/lib/admin-permissions")) {
    throw new Error(`SEO API must not import root monolith auth/database modules: ${seoRoute}`);
  }
}

const seoInspector = read("apps/admin/lib/seo/live-inspection.ts");
if (!seoInspector.includes("Only public TheOutHaven HTTPS URLs can be inspected.")) {
  throw new Error("SEO live inspection must preserve TheOutHaven host restrictions.");
}

if (!adminNavigation.includes("/admin/dashboard/seo")) {
  throw new Error("SEO Operations navigation must be present in the isolated Admin shell.");
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
