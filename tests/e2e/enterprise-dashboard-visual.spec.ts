import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

type Surface = "admin" | "business";
type Theme = "light" | "dark";
type RouteCase = { surface: Surface; route: string; source: string };

const bases = {
  admin: process.env.ADMIN_BASE_URL || "https://admin.theouthaven.com",
  business: process.env.BUSINESS_BASE_URL || "https://business.theouthaven.com",
};

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 1024, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const themes: Theme[] = ["light", "dark"];
const scope = (process.env.ENTERPRISE_VISUAL_SCOPE || "critical").toLowerCase();
const surfaceFilter = (process.env.ENTERPRISE_VISUAL_SURFACE || "all").toLowerCase();

const criticalRoutes: RouteCase[] = [
  { surface: "admin", route: "/admin/dashboard", source: "critical" },
  { surface: "admin", route: "/admin/dashboard/search-health", source: "critical" },
  { surface: "admin", route: "/admin/dashboard/security/apple-devices", source: "critical" },
  { surface: "admin", route: "/admin/dashboard/settings/microsoft-365", source: "critical" },
  { surface: "admin", route: "/admin/dashboard/crm/support", source: "critical" },
  { surface: "admin", route: "/admin/dashboard/fraud", source: "critical" },
  { surface: "admin", route: "/admin/dashboard/experiences", source: "critical" },
  { surface: "business", route: "/business/dashboard", source: "critical" },
  { surface: "business", route: "/business/dashboard/analytics", source: "critical" },
  { surface: "business", route: "/business/dashboard/settings", source: "critical" },
  { surface: "business", route: "/locations/dashboard", source: "critical" },
  { surface: "business", route: "/locations/dashboard/reservations", source: "critical" },
  { surface: "business", route: "/locations/dashboard/analytics", source: "critical" },
  { surface: "business", route: "/locations/dashboard/settings", source: "critical" },
];

function walkPages(root: string, routeRoot: string, surface: Surface): RouteCase[] {
  if (!existsSync(root)) return [];
  const results: RouteCase[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const absolute = path.join(dir, entry);
      if (statSync(absolute).isDirectory()) {
        walk(absolute);
        continue;
      }
      if (entry !== "page.tsx") continue;
      const relative = path.relative(root, dir).replaceAll(path.sep, "/");
      const route = relative ? `${routeRoot}/${relative}` : routeRoot;
      results.push({ surface, route, source: absolute });
    }
  }

  walk(root);
  return results;
}

function parseDynamicRouteMap() {
  try {
    const raw = process.env.ENTERPRISE_VISUAL_DYNAMIC_ROUTE_MAP_JSON || "{}";
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function resolveDynamicRoute(route: string, map: Record<string, string>) {
  if (!route.includes("[")) return route;
  return map[route] || null;
}

function fullRouteMatrix() {
  const dynamicMap = parseDynamicRouteMap();
  const discovered = [
    ...walkPages(
      "apps/admin/app/admin/dashboard",
      "/admin/dashboard",
      "admin",
    ),
    ...walkPages(
      "apps/business/app/business/dashboard",
      "/business/dashboard",
      "business",
    ),
    ...walkPages(
      "apps/business/app/locations/dashboard",
      "/locations/dashboard",
      "business",
    ),
  ];

  const unique = new Map<string, RouteCase>();
  for (const item of discovered) {
    const resolved = resolveDynamicRoute(item.route, dynamicMap);
    if (!resolved) continue;
    unique.set(`${item.surface}:${resolved}`, { ...item, route: resolved });
  }
  return [...unique.values()].sort((a, b) =>
    `${a.surface}:${a.route}`.localeCompare(`${b.surface}:${b.route}`),
  );
}

const allRoutes = scope === "full" ? fullRouteMatrix() : criticalRoutes;
const routes = surfaceFilter === "all"
  ? allRoutes
  : allRoutes.filter((route) => route.surface === surfaceFilter);

function storageStateFor(surface: Surface) {
  return surface === "admin"
    ? process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE
    : process.env.PLAYWRIGHT_BUSINESS_STORAGE_STATE;
}

async function createThemedContext(
  browser: Browser,
  surface: Surface,
  theme: Theme,
  viewport: { width: number; height: number },
): Promise<BrowserContext> {
  const storageState = storageStateFor(surface);
  if (!storageState) throw new Error(`${surface} storage state is not configured`);

  const context = await browser.newContext({ storageState, viewport });
  await context.addInitScript(
    ({ targetSurface, targetTheme }) => {
      if (targetSurface === "admin") {
        localStorage.setItem(
          "theouthaven.admin.appearance.v1",
          JSON.stringify({ mode: targetTheme, lightStart: "07:00", darkStart: "19:00" }),
        );
      } else {
        localStorage.setItem("theouthaven_business_theme", targetTheme);
      }
    },
    { targetSurface: surface, targetTheme: theme },
  );
  return context;
}

async function assertEnterpriseFrame(page: Page, surface: Surface, theme: Theme) {
  await expect(page.locator("body")).toBeVisible();
  const bodyText = await page.locator("body").innerText().catch(() => "");
  expect(bodyText).not.toMatch(/Application error|Internal Server Error|This page could not be found/i);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `horizontal overflow: ${overflow.scrollWidth}px > ${overflow.clientWidth}px`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 2);

  if (surface === "admin") {
    await expect(page.locator(".admin-shell")).toHaveAttribute("data-admin-theme", theme);
  } else {
    await expect(page.locator(".business-dashboard-theme")).toHaveClass(
      new RegExp(`business-theme-${theme}`),
    );
  }
}

function safeName(value: string) {
  return value.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

for (const routeCase of routes) {
  for (const theme of themes) {
    for (const viewport of viewports) {
      test(`enterprise visual: ${routeCase.surface} ${routeCase.route} ${theme} ${viewport.name}`, async ({ browser }, testInfo: TestInfo) => {
        const state = storageStateFor(routeCase.surface);
        test.skip(!state, `${routeCase.surface} authenticated browser state is not configured`);

        const context = await createThemedContext(browser, routeCase.surface, theme, viewport);
        const page = await context.newPage();
        try {
          const response = await page.goto(`${bases[routeCase.surface]}${routeCase.route}`, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          });
          expect(response?.status() ?? 599).toBeLessThan(500);
          await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
          expect(page.url()).not.toMatch(/\/admin\/login|\/business\/login|\/login(?:\?|$)/i);
          await assertEnterpriseFrame(page, routeCase.surface, theme);

          const screenshot = await page.screenshot({ fullPage: true });
          await testInfo.attach(
            `${routeCase.surface}-${safeName(routeCase.route)}-${theme}-${viewport.name}.png`,
            { body: screenshot, contentType: "image/png" },
          );
        } finally {
          await context.close();
        }
      });
    }
  }
}
