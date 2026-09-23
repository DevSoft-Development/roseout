import { expect, type Page, type TestInfo } from "@playwright/test";

export type ProductionDiagnostics = {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  serverErrors: string[];
};

const hardErrorPattern =
  /This page could not be found|Application error|Internal Server Error|The string did not match the expected pattern/i;

export function selectedSurface(surface: string) {
  const raw = (process.env.PRODUCTION_BROWSER_SURFACES || "all")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return raw.includes("all") || raw.includes(surface.toLowerCase());
}

function sameOrigin(url: string, baseUrl: string) {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

export function collectProductionDiagnostics(
  page: Page,
  baseUrl: string,
): ProductionDiagnostics {
  const diagnostics: ProductionDiagnostics = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    serverErrors: [],
  };

  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(error.message);
  });

  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });

  page.on("requestfailed", (request) => {
    if (!sameOrigin(request.url(), baseUrl)) return;
    const reason = request.failure()?.errorText || "request failed";
    if (/ERR_ABORTED/i.test(reason)) return;
    diagnostics.failedRequests.push(`${request.method()} ${request.url()} — ${reason}`);
  });

  page.on("response", (response) => {
    if (!sameOrigin(response.url(), baseUrl)) return;
    if (response.status() >= 500) {
      diagnostics.serverErrors.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });

  return diagnostics;
}

export async function gotoProductionPage(
  page: Page,
  url: string,
  attempts = 4,
) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      if (response && response.status() < 500) {
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
        return response;
      }
      lastError = new Error(`Production page returned ${response?.status() ?? "no response"}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await page.waitForTimeout(5_000);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Production navigation failed");
}

export async function assertNoHardProductionError(page: Page) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  expect(bodyText).not.toMatch(hardErrorPattern);
}

export async function attachProductionEvidence(
  page: Page,
  testInfo: TestInfo,
  surface: string,
  diagnostics: ProductionDiagnostics,
) {
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(`${surface}-production.png`, {
    body: screenshot,
    contentType: "image/png",
  });

  await testInfo.attach(`${surface}-diagnostics.json`, {
    body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
    contentType: "application/json",
  });
}

export function assertDiagnosticsClean(diagnostics: ProductionDiagnostics) {
  expect(diagnostics.pageErrors, "uncaught browser page errors").toEqual([]);
  expect(diagnostics.failedRequests, "failed first-party requests").toEqual([]);
  expect(diagnostics.serverErrors, "first-party 5xx responses").toEqual([]);

  const fatalConsoleErrors = diagnostics.consoleErrors.filter((message) =>
    /The string did not match the expected pattern|TypeError:|ReferenceError:|SyntaxError:|Unhandled/i.test(
      message,
    ),
  );
  expect(fatalConsoleErrors, "fatal browser console errors").toEqual([]);
}
