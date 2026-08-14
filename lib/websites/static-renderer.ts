import "server-only";

import type { BusinessWebsite, WebsiteSection } from "@/lib/websites/data";
import type { WebsiteArtifactFile } from "@/lib/websites/publish-contract";

type LocationSnapshot = {
  id: string;
  name?: string | null;
  title?: string | null;
  address?: string | null;
  phone?: string | null;
  hours?: string | null;
  reservation_link?: string | null;
  image_url?: string | null;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sectionHtml(section: WebsiteSection, location: LocationSnapshot, website: BusinessWebsite) {
  if (!section.enabled) return "";
  const name = escapeHtml(location.name || location.title || website.site_title || "Business");
  const heading = escapeHtml(section.heading || "");
  const body = escapeHtml(section.body || "");

  switch (section.type) {
    case "hero":
      return `<section class=\"hero\"><h1>${name}</h1>${location.image_url ? `<img src=\"${escapeHtml(location.image_url)}\" alt=\"${name}\">` : ""}</section>`;
    case "about":
      return `<section><h2>${heading || "About"}</h2>${body ? `<p>${body}</p>` : ""}</section>`;
    case "hours":
      return location.hours ? `<section><h2>Hours</h2><p>${escapeHtml(location.hours)}</p></section>` : "";
    case "reservations":
      return location.reservation_link ? `<section><a href=\"${escapeHtml(location.reservation_link)}\" rel=\"noopener noreferrer\">Reserve</a></section>` : "";
    case "contact":
      return `<section><h2>Contact</h2>${location.address ? `<p>${escapeHtml(location.address)}</p>` : ""}${location.phone ? `<p>${escapeHtml(location.phone)}</p>` : ""}</section>`;
    default:
      return `<section>${heading ? `<h2>${heading}</h2>` : ""}${body ? `<p>${body}</p>` : ""}</section>`;
  }
}

export function renderWebsiteArtifact(website: BusinessWebsite, location: LocationSnapshot): WebsiteArtifactFile[] {
  const title = escapeHtml(website.site_title || location.name || location.title || "Business");
  const sections = (website.sections || []).map((section) => sectionHtml(section, location, website)).join("\n");
  const html = `<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>${title}</title><style>body{margin:0;font-family:system-ui,sans-serif;background:#0d0d0f;color:#fff}main{max-width:1100px;margin:auto;padding:48px 24px}section{padding:32px 0;border-bottom:1px solid #2a2a2f}h1{font-size:clamp(2.5rem,7vw,5.5rem);margin:0}h2{font-size:2rem}img{width:100%;max-height:620px;object-fit:cover;border-radius:24px;margin-top:24px}a{color:#f5b700}</style></head><body><main>${sections}</main></body></html>`;
  return [{ path: "index.html", content: html, encoding: "utf8" }];
}
