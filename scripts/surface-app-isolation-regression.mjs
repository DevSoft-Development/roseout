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

const productionCi = read(".github/workflows/production-ci.yml");
if (productionCi.includes("tsconfig.*\\.json|\\.github/workflows/production-ci\\.yml")) {
  throw new Error("Production CI must not classify root tsconfig/workflow-only changes as every regression domain.");
}
if (!productionCi.includes("apps/admin/") || !productionCi.includes("packages/(auth|db|config)/")) {
  throw new Error("Production CI must route isolated Admin/auth/db/config changes through the security regression lane.");
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

console.log("Surface app isolation, shared packages, and Admin auth regression passed.");
