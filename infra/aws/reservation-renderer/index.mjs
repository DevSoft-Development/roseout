import dns from "node:dns/promises";
import net from "node:net";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const MAX_HTML_BYTES = 600_000;
const NAVIGATION_TIMEOUT_MS = 12_000;
const SETTLE_MS = 1_500;
const dnsCache = new Map();

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a === 0;
}

function isPrivateIpv6(address) {
  const value = address.toLowerCase();
  return value === "::1"
    || value === "::"
    || value.startsWith("fc")
    || value.startsWith("fd")
    || value.startsWith("fe8")
    || value.startsWith("fe9")
    || value.startsWith("fea")
    || value.startsWith("feb");
}

function isPrivateIp(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function assertPublicUrl(raw) {
  const url = new URL(String(raw || ""));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) URLs are allowed");
  if (url.username || url.password) throw new Error("Credentialed URLs are not allowed");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Private hostname is not allowed");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Private IP is not allowed");
    return url;
  }
  let resolved = dnsCache.get(host);
  if (!resolved) {
    resolved = await dns.lookup(host, { all: true, verbatim: true });
    dnsCache.set(host, resolved);
  }
  if (!resolved.length || resolved.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("Hostname resolves to a private or invalid address");
  }
  return url;
}

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export async function handler(event) {
  let payload;
  try {
    payload = typeof event?.body === "string" ? JSON.parse(event.body) : (event?.body || event || {});
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  let target;
  try {
    target = await assertPublicUrl(payload.url);
  } catch (error) {
    return json(400, { ok: false, error: error instanceof Error ? error.message : "invalid_url" });
  }

  chromium.setGraphicsMode = false;
  let browser;
  try {
    browser = await puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      defaultViewport: { width: 1365, height: 768, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    await page.setRequestInterception(true);

    page.on("request", async (request) => {
      try {
        const requestUrl = new URL(request.url());
        if (!["http:", "https:"].includes(requestUrl.protocol)) return request.abort();
        if (["image", "media", "font"].includes(request.resourceType())) return request.abort();
        await assertPublicUrl(requestUrl.toString());
        return request.continue();
      } catch {
        return request.abort();
      }
    });

    await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    const finalUrl = page.url();
    const html = await page.content();
    const truncated = Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES;
    const body = truncated ? Buffer.from(html, "utf8").subarray(0, MAX_HTML_BYTES).toString("utf8") : html;

    return json(200, {
      ok: true,
      finalUrl,
      html: body,
      truncated,
    });
  } catch (error) {
    return json(200, {
      ok: false,
      error: error instanceof Error ? error.message : "render_failed",
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
