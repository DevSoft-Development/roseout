import { NextResponse } from "next/server";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const confirmation = "superiority-burger-119-avenue-a";
function normalize(x: unknown) { return String(x ?? "").trim().toLowerCase().replace(/\s+/g, " "); }
function findIdentity(html: string) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const queue: unknown[] = [parsed];
      while (queue.length) {
        const value = queue.shift();
        if (Array.isArray(value)) { queue.push(...value); continue; }
        if (!value || typeof value !== "object") continue;
        const obj = value as Record<string, any>;
        if (obj["@graph"]) queue.push(obj["@graph"]);
        const kinds = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]];
        const a = obj.address;
        if (kinds.some((kind: unknown) => /restaurant|foodestablishment/i.test(String(kind))) &&
          a && typeof a === "object" &&
          normalize(obj.name) === "superiority burger" &&
          normalize(a.streetAddress) === "119 avenue a" &&
          normalize(a.addressLocality) === "new york" &&
          ["ny", "new york"].includes(normalize(a.addressRegion))) {
          return { name: obj.name, streetAddress: a.streetAddress, city: a.addressLocality, state: a.addressRegion };
        }
      }
    } catch { /* Invalid JSON-LD cannot establish identity. */ }
  }
  return null;
}
async function evidence(url: string) {
  const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("upstream_http_" + response.status);
  return response;
}
export async function POST(request: Request) {
  await requireAdminRole(["superadmin"]);
  if (process.env.PLATFORM_RUNTIME_PROVIDER !== "aws-admin" ||
      process.env.LI_V2_SINGLE_LOCATION_BOOTSTRAP_ENABLED !== "true")
    return NextResponse.json({ ok: false, error: "certification_not_authorized" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (body?.confirmation !== confirmation || body?.dryRun !== true)
    return NextResponse.json({ ok: false, error: "exact_dry_run_confirmation_required" }, { status: 400 });
  try {
    const html = (await (await evidence("https://www.superiorityburger.com/")).text()).slice(0, 750000);
    let identity = findIdentity(html);
    if (!identity) {
      // Official first-party location and history pages can establish identity
      // when the homepage omits Restaurant JSON-LD. Require BOTH independently
      // fetched first-party pages to agree; never use search snippets.
      const [contactHtml, aboutHtml] = await Promise.all([
        evidence("https://www.superiorityburger.com/contact").then(r => r.text()),
        evidence("https://www.superiorityburger.com/about").then(r => r.text()),
      ]);
      const strip = (text: string) => text.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, " ")
        .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
        .replace(/\\s+/g, " ").toLowerCase();
      const contact = strip(contactHtml);
      const about = strip(aboutHtml);
      const hasName = /superiority burger/i.test(contactHtml) && /superiority burger/i.test(aboutHtml);
      const hasCurrentAddress = /119\\s+avenue\\s+a\\b/i.test(contact) &&
        /new york\\s*,?\\s*ny\\s*10009/i.test(contact);
      const confirmsMove = /119\\s+avenue\\s+a\\b/i.test(about) &&
        /2023/.test(about) && /relocat|mov(ed|ing)/.test(about);
      if (hasName && hasCurrentAddress && confirmsMove)
        identity = { name: "Superiority Burger", streetAddress: "119 Avenue A",
          city: "New York", state: "NY", evidence: ["official_contact", "official_about"] };
    }
    if (!identity) return NextResponse.json({ ok: false, dryRun: true, stage: "official_evidence",
      reason: "official_structured_identity_missing", writes: 0, paidRequests: 0 }, { status: 422 });
    const response = await evidence("https://commons.wikimedia.org/w/api.php?action=query&titles=File%3ASuperiority_Burger_NYC.jpg&prop=imageinfo&iiprop=extmetadata%7Curl&format=json");
    const payload = await response.json() as { query?: { pages?: Record<string, {
      imageinfo?: { url?: string; extmetadata?: Record<string, { value?: string }> }[]
    }> } };
    const info = Object.values(payload.query?.pages ?? {})[0]?.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    const license = String(meta.LicenseShortName?.value ?? "");
    const attribution = String(meta.Artist?.value ?? "");
    const licenseUrl = String(meta.LicenseUrl?.value ?? "");
    if (!info?.url?.startsWith("https://") || license !== "CC BY-SA 4.0" ||
        licenseUrl !== "https://creativecommons.org/licenses/by-sa/4.0/" || !attribution.trim())
      return NextResponse.json({ ok: false, dryRun: true, stage: "photo",
        reason: "commons_license_or_attribution_unverified", writes: 0, paidRequests: 0 }, { status: 422 });
    return NextResponse.json({ ok: true, dryRun: true, identity,
      photo: { filePageUrl: "https://commons.wikimedia.org/wiki/File:Superiority_Burger_NYC.jpg",
        license, licenseUrl, attribution }, writes: 0, paidRequests: 0,
      importExecuted: false, searchV3RetrievalCertified: false });
  } catch (error) {
    console.error("li_v2_isolated_certification_failed", error);
    return NextResponse.json({ ok: false, dryRun: true, error: "external_evidence_unavailable",
      writes: 0, paidRequests: 0 }, { status: 502 });
  }
}
