import "server-only";

import type { BusinessWebsite, WebsiteSection } from "@/lib/websites/data";
import type { GeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import type { WebsiteArtifactFile } from "@/lib/websites/publish-contract";
import { renderWebsiteArtifact } from "@/lib/websites/static-renderer";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function enabledSection(website: BusinessWebsite, type: WebsiteSection["type"]) {
  return (website.sections || []).find((section) => section.type === type && section.enabled) || null;
}

function richStyles() {
  return `.toh-rich-section{width:min(var(--max),calc(100% - 48px));margin:0 auto;padding:clamp(64px,8vw,110px) 0;border-top:1px solid var(--border)}.toh-rich-head{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:32px;margin-bottom:30px}.toh-rich-head h2{margin:0;font-family:var(--display);font-size:clamp(34px,5vw,72px);font-weight:500;line-height:1}.toh-rich-head p{margin:0;color:var(--muted);font-size:16px;max-width:650px}.toh-gallery-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:12px}.toh-gallery-grid figure{margin:0;overflow:hidden;border-radius:var(--radius);background:var(--surface2)}.toh-gallery-grid figure:nth-child(1){grid-column:span 7}.toh-gallery-grid figure:nth-child(2){grid-column:span 5}.toh-gallery-grid figure:nth-child(n+3){grid-column:span 4}.toh-gallery-grid img{width:100%;height:100%;min-height:260px;object-fit:cover;aspect-ratio:4/3}.toh-hours-panel{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end;padding:24px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}.toh-hours-copy{margin:0;white-space:pre-line;color:var(--text);font-size:16px;line-height:1.8}.toh-menu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.toh-menu-item{display:grid;grid-template-columns:1fr auto;gap:8px 18px;padding:20px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}.toh-menu-item h3{margin:0;font-size:17px}.toh-menu-item p{grid-column:1/-1;margin:0;color:var(--muted);font-size:13px}.toh-menu-item strong{color:var(--accent)}.toh-menu-section{grid-column:1/-1;margin:20px 0 2px;color:var(--accent);font-size:11px;text-transform:uppercase;letter-spacing:.16em}.toh-rich-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.toh-reviews-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.toh-review{padding:22px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}.toh-review-stars{color:var(--accent);letter-spacing:.08em}.toh-review blockquote{margin:14px 0;color:var(--text);font-family:var(--display);font-size:20px;line-height:1.35}.toh-review cite{font-style:normal;color:var(--muted);font-size:12px;font-weight:800}@media(max-width:760px){.toh-rich-head,.toh-hours-panel{grid-template-columns:1fr}.toh-gallery-grid figure,.toh-gallery-grid figure:nth-child(1),.toh-gallery-grid figure:nth-child(2),.toh-gallery-grid figure:nth-child(n+3){grid-column:span 12}.toh-menu-grid,.toh-reviews-grid{grid-template-columns:1fr}}`;
}

function galleryHtml(section: WebsiteSection | null, location: GeneratedWebsiteLocationSnapshot) {
  if (!section || !location.photos.length) return "";
  const name = escapeHtml(location.name || location.title || "this location");
  const photos = location.photos.slice(0, 6).map((url, index) => `<figure><img src="${escapeHtml(url)}" alt="${name} photo ${index + 1}" loading="lazy"></figure>`).join("");
  return `<section class="toh-rich-section" id="gallery"><div class="toh-rich-head"><h2>${escapeHtml(section.heading || "See the experience")}</h2><p>${escapeHtml(section.body || `Explore real photos from ${name}.`)}</p></div><div class="toh-gallery-grid">${photos}</div></section>`;
}

function hoursHtml(section: WebsiteSection | null, location: GeneratedWebsiteLocationSnapshot) {
  if (!section || !location.hours) return "";
  return `<section class="toh-rich-section" id="hours"><div class="toh-rich-head"><h2>${escapeHtml(section.heading || "Hours")}</h2><p>${escapeHtml(section.body || "Plan your visit with the latest business hours.")}</p></div><div class="toh-hours-panel"><p class="toh-hours-copy">${escapeHtml(location.hours)}</p><a class="button primary compact" href="#reserve">Reserve a time</a></div></section>`;
}

function menuHtml(section: WebsiteSection | null, location: GeneratedWebsiteLocationSnapshot) {
  if (!section || !location.menu) return "";
  const menu = location.menu;
  let previousSection = "";
  const items = menu.items.slice(0, 16).map((item) => {
    const sectionLabel = item.section && item.section !== previousSection ? `<div class="toh-menu-section">${escapeHtml(item.section)}</div>` : "";
    if (item.section) previousSection = item.section;
    return `${sectionLabel}<article class="toh-menu-item"><h3>${escapeHtml(item.name)}</h3>${item.price ? `<strong>${escapeHtml(item.price)}</strong>` : ""}${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}</article>`;
  }).join("");
  const actions = [
    menu.external_url ? `<a class="button primary compact" href="${escapeHtml(menu.external_url)}" target="_blank" rel="noreferrer">View full menu</a>` : "",
    menu.pdf_url ? `<a class="button ghost compact" href="${escapeHtml(menu.pdf_url)}" target="_blank" rel="noreferrer">View menu PDF</a>` : "",
  ].filter(Boolean).join("");
  return `<section class="toh-rich-section" id="menu"><div class="toh-rich-head"><h2>${escapeHtml(section.heading || menu.title || "Explore the menu")}</h2><p>${escapeHtml(section.body || menu.description || "Browse current menu highlights.")}</p></div>${items ? `<div class="toh-menu-grid">${items}</div>` : ""}${actions ? `<div class="toh-rich-actions">${actions}</div>` : ""}</section>`;
}

function reviewsHtml(section: WebsiteSection | null, location: GeneratedWebsiteLocationSnapshot) {
  if (!section || !location.reviews.length) return "";
  const reviews = location.reviews.slice(0, 6).map((review) => `<article class="toh-review"><div class="toh-review-stars" aria-label="${review.rating} out of 5 stars">${"★".repeat(Math.round(review.rating))}${"☆".repeat(5 - Math.round(review.rating))}</div><blockquote>“${escapeHtml(review.review_text)}”</blockquote><cite>${escapeHtml(review.customer_name)} · Verified TheOutHaven guest</cite></article>`).join("");
  return `<section class="toh-rich-section" id="reviews"><div class="toh-rich-head"><h2>${escapeHtml(section.heading || "What guests are saying")}</h2><p>${escapeHtml(section.body || "Read verified feedback from TheOutHaven guests.")}</p></div><div class="toh-reviews-grid">${reviews}</div></section>`;
}

export function renderEnhancedWebsiteArtifact(
  website: BusinessWebsite,
  location: GeneratedWebsiteLocationSnapshot,
): WebsiteArtifactFile[] {
  const richTypes = new Set(["gallery", "hours", "menu", "reviews"]);
  const baseWebsite: BusinessWebsite = {
    ...website,
    sections: (website.sections || []).filter((section) => !richTypes.has(section.type)),
  };
  const files = renderWebsiteArtifact(baseWebsite, location);
  const richHtml = [
    galleryHtml(enabledSection(website, "gallery"), location),
    hoursHtml(enabledSection(website, "hours"), location),
    menuHtml(enabledSection(website, "menu"), location),
    reviewsHtml(enabledSection(website, "reviews"), location),
  ].filter(Boolean).join("\n");

  return files.map((file) => {
    if (file.path !== "index.html" || !file.content) return file;
    let content = file.content.replace("</style>", `${richStyles()}</style>`);
    if (richHtml) {
      const reservationIndex = content.indexOf('<section class="reservation-section"');
      content = reservationIndex >= 0
        ? `${content.slice(0, reservationIndex)}${richHtml}${content.slice(reservationIndex)}`
        : content.replace("</main>", `${richHtml}</main>`);
    }
    return { ...file, content, encoding: "utf8" as const };
  });
}
