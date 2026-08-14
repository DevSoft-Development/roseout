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

type GeneratedContent = {
  hero?: { heading?: string; subheading?: string; ctaLabel?: string };
  about?: { heading?: string; body?: string };
  seo?: { title?: string; description?: string };
};

type Tokens = {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  border: string;
  typography: string;
  density: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function generatedContent(website: BusinessWebsite): GeneratedContent {
  const generated = website.custom_content?.generated;
  return generated && typeof generated === "object" ? generated as GeneratedContent : {};
}

function designVision(website: BusinessWebsite) {
  return stringValue(website.custom_content?.design_vision).toLowerCase();
}

function directionTokens(website: BusinessWebsite): Tokens {
  const direction = stringValue(website.theme?.design_direction_id);
  const contrast = stringValue(website.theme?.contrast) || "dark";
  const typography = stringValue(website.theme?.typography) || "modern";
  const density = stringValue(website.theme?.density) || "balanced";
  const dark = contrast !== "light";

  const palettes: Record<string, Omit<Tokens, "typography" | "density">> = {
    refined_after_dark: { bg: "#0d0d0f", surface: "#17171a", text: "#f7f3ed", muted: "#aaa49b", accent: "#d7b46a", accentText: "#17130d", border: "#2c2b2d" },
    cocktail_society: { bg: "#0f0b0d", surface: "#1a1316", text: "#f8efec", muted: "#b5a5a5", accent: "#d98e69", accentText: "#1b0d08", border: "#342429" },
    editorial_luxury: { bg: "#f5f0e8", surface: "#fffdf9", text: "#211d19", muted: "#70665d", accent: "#875a38", accentText: "#fffaf4", border: "#ddd3c5" },
    modern_minimal: { bg: "#f5f5f3", surface: "#ffffff", text: "#151515", muted: "#676764", accent: "#161616", accentText: "#ffffff", border: "#deded8" },
    warm_neighborhood: { bg: "#f7efe5", surface: "#fffaf4", text: "#30251c", muted: "#74675c", accent: "#a55237", accentText: "#fff9f4", border: "#e1d1bf" },
    classic_bistro: { bg: "#f3efe8", surface: "#fbf8f2", text: "#241f1a", muted: "#6b6259", accent: "#7d3333", accentText: "#fff9f5", border: "#d9cec1" },
    bold_social: { bg: "#111116", surface: "#1a1a22", text: "#ffffff", muted: "#b8b5c4", accent: "#f4b936", accentText: "#18130a", border: "#34333d" },
    coastal_airy: { bg: "#f4f8f7", surface: "#ffffff", text: "#183039", muted: "#677980", accent: "#347d88", accentText: "#ffffff", border: "#d5e2e1" },
    natural_retreat: { bg: "#f2f2ea", surface: "#faf9f3", text: "#253026", muted: "#687066", accent: "#687b58", accentText: "#ffffff", border: "#d8dccf" },
    creative_workshop: { bg: "#fff7ee", surface: "#ffffff", text: "#2a211b", muted: "#786b61", accent: "#c45f42", accentText: "#ffffff", border: "#ead7c7" },
    wellness_escape: { bg: "#f4f7f3", surface: "#ffffff", text: "#24332d", muted: "#6c7b75", accent: "#738b7c", accentText: "#ffffff", border: "#d9e1dc" },
  };

  const fallback = dark
    ? { bg: "#0f0f12", surface: "#18181d", text: "#f8f8f6", muted: "#aaaab1", accent: "#f5b700", accentText: "#151515", border: "#2b2b31" }
    : { bg: "#f7f5f0", surface: "#ffffff", text: "#1b1b1b", muted: "#6b6b68", accent: "#8a5a32", accentText: "#ffffff", border: "#dedbd4" };

  return { ...(palettes[direction] || fallback), typography, density };
}

function layoutMode(website: BusinessWebsite) {
  const direction = stringValue(website.theme?.design_direction_id);
  const vision = designVision(website);
  const text = `${direction} ${vision}`;

  if (/(minimal|clean|simple|sleek|airy|modern)/.test(text)) return "minimal";
  if (/(bold|social|energetic|party|nightlife|fun|vibrant)/.test(text)) return "social";
  if (/(warm|cozy|neighborhood|friendly|rustic|classic|bistro)/.test(text)) return "warm";
  if (/(luxury|editorial|romantic|intimate|moody|refined|cocktail|premium)/.test(text)) return "editorial";
  return "editorial";
}

function sectionCopy(section: WebsiteSection, generated: GeneratedContent) {
  if (section.type === "hero") {
    return {
      heading: stringValue(generated.hero?.heading) || stringValue(section.heading),
      body: stringValue(generated.hero?.subheading) || stringValue(section.body),
    };
  }
  if (section.type === "about") {
    return {
      heading: stringValue(generated.about?.heading) || stringValue(section.heading) || "About",
      body: stringValue(generated.about?.body) || stringValue(section.body),
    };
  }
  return { heading: stringValue(section.heading), body: stringValue(section.body) };
}

function sectionHtml(section: WebsiteSection, location: LocationSnapshot, website: BusinessWebsite, generated: GeneratedContent) {
  if (!section.enabled) return "";
  const name = escapeHtml(location.name || location.title || website.site_title || "Business");
  const copy = sectionCopy(section, generated);
  const heading = escapeHtml(copy.heading);
  const body = escapeHtml(copy.body);
  const reserveLabel = escapeHtml(stringValue(generated.hero?.ctaLabel) || "Reserve a table");

  switch (section.type) {
    case "hero":
      return `<section class=\"hero\"><div class=\"hero-copy-column\"><p class=\"kicker\">${escapeHtml(website.site_title || name)}</p><h1>${heading || name}</h1>${body ? `<p class=\"hero-copy\">${body}</p>` : ""}<div class=\"hero-actions\">${location.reservation_link ? `<a class=\"button primary\" href=\"${escapeHtml(location.reservation_link)}\" rel=\"noopener noreferrer\">${reserveLabel}</a>` : ""}${location.phone ? `<a class=\"button secondary\" href=\"tel:${escapeHtml(location.phone)}\">Call</a>` : ""}</div></div>${location.image_url ? `<div class=\"hero-media\"><img src=\"${escapeHtml(location.image_url)}\" alt=\"${name}\"></div>` : ""}</section>`;
    case "about":
      return `<section class=\"section about-section\"><div><p class=\"kicker\">The story</p><h2>${heading || "About"}</h2></div><div>${body ? `<p class=\"lede\">${body}</p>` : `<p class=\"lede\">Discover what makes ${name} worth the trip.</p>`}</div></section>`;
    case "gallery":
      return location.image_url ? `<section class=\"section\"><div class=\"section-heading\"><div><p class=\"kicker\">The experience</p><h2>${heading || "A look inside"}</h2></div>${location.reservation_link ? `<a class=\"text-link\" href=\"${escapeHtml(location.reservation_link)}\" rel=\"noopener noreferrer\">Reserve →</a>` : ""}</div><div class=\"gallery-card\"><img src=\"${escapeHtml(location.image_url)}\" alt=\"${name}\"><div class=\"gallery-meta\"><strong>${name}</strong><span>${escapeHtml(location.address || "Plan your visit")}</span></div></div></section>` : "";
    case "hours":
      return location.hours ? `<section class=\"section info-section\"><div><p class=\"kicker\">Plan your visit</p><h2>Hours</h2></div><div class=\"info-card\"><p>${escapeHtml(location.hours)}</p></div></section>` : "";
    case "reservations":
      return location.reservation_link ? `<section class=\"section reserve-panel\"><div><p class=\"kicker\">Reservations</p><h2>${heading || "Book your next visit"}</h2>${body ? `<p>${body}</p>` : ""}</div><a class=\"button primary\" href=\"${escapeHtml(location.reservation_link)}\" rel=\"noopener noreferrer\">${reserveLabel}</a></section>` : "";
    case "contact":
      return `<section class=\"section info-section\"><div><p class=\"kicker\">Visit</p><h2>${heading || "Find us"}</h2></div><div class=\"contact-grid\">${location.address ? `<div class=\"info-card\"><span>Address</span><p>${escapeHtml(location.address)}</p></div>` : ""}${location.phone ? `<div class=\"info-card\"><span>Phone</span><p><a href=\"tel:${escapeHtml(location.phone)}\">${escapeHtml(location.phone)}</a></p></div>` : ""}</div></section>`;
    default:
      return `<section class=\"section\">${heading ? `<h2>${heading}</h2>` : ""}${body ? `<p class=\"lede\">${body}</p>` : ""}</section>`;
  }
}

export function renderWebsiteArtifact(website: BusinessWebsite, location: LocationSnapshot): WebsiteArtifactFile[] {
  const generated = generatedContent(website);
  const tokens = directionTokens(website);
  const mode = layoutMode(website);
  const title = escapeHtml(stringValue(generated.seo?.title) || website.site_title || location.name || location.title || "Business");
  const description = escapeHtml(stringValue(generated.seo?.description) || `Visit ${location.name || location.title || website.site_title || "us"}.`);
  const businessName = escapeHtml(location.name || location.title || website.site_title || "Business");
  const sections = (website.sections || []).map((section) => sectionHtml(section, location, website, generated)).join("\n");
  const fontStack = tokens.typography === "editorial" ? "Georgia, 'Times New Roman', serif" : tokens.typography === "classic" ? "'Palatino Linotype', Palatino, Georgia, serif" : "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const sectionSpace = tokens.density === "compact" ? "54px" : tokens.density === "airy" ? "82px" : "68px";

  const html = `<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>${title}</title><meta name=\"description\" content=\"${description}\"><style>:root{--bg:${tokens.bg};--surface:${tokens.surface};--text:${tokens.text};--muted:${tokens.muted};--accent:${tokens.accent};--accentText:${tokens.accentText};--border:${tokens.border};--section:${sectionSpace};--radius:${mode === "minimal" ? "14px" : mode === "social" ? "24px" : "20px"};--max:1180px}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:${fontStack};line-height:1.55}a{color:inherit;text-decoration:none}img{display:block;max-width:100%}.site-nav{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px max(22px,calc((100vw - var(--max))/2));background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid var(--border)}.brand{font:800 15px/1.2 ui-sans-serif,system-ui;letter-spacing:.02em}.nav-actions{display:flex;gap:8px}.nav-link{padding:10px 15px;border-radius:999px;border:1px solid var(--border);font:750 13px/1 ui-sans-serif,system-ui}.nav-link.reserve{background:var(--accent);border-color:var(--accent);color:var(--accentText)}main{width:100%}.hero{width:min(var(--max),calc(100% - 44px));margin:32px auto 0;display:grid;grid-template-columns:minmax(0,.95fr) minmax(360px,1.05fr);gap:clamp(28px,5vw,68px);align-items:center;min-height:520px}.hero-copy-column{padding:28px 0}.kicker{margin:0 0 14px;text-transform:uppercase;letter-spacing:.16em;font:800 11px/1.3 ui-sans-serif,system-ui;color:var(--accent)}.hero h1{margin:0;max-width:760px;font-size:clamp(3rem,6.5vw,6.2rem);line-height:.94;letter-spacing:-.04em}.hero-copy{max-width:600px;margin:22px 0 0;color:var(--muted);font:500 clamp(1rem,1.6vw,1.2rem)/1.65 ui-sans-serif,system-ui}.hero-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 19px;border-radius:999px;font:800 13px/1 ui-sans-serif,system-ui;transition:transform .18s ease,opacity .18s ease}.button:hover{transform:translateY(-1px)}.button.primary{background:var(--accent);color:var(--accentText)}.button.secondary{border:1px solid var(--border);background:var(--surface)}.hero-media{height:500px;overflow:hidden;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border)}.hero-media img{width:100%;height:100%;object-fit:cover}.section{width:min(var(--max),calc(100% - 44px));margin:0 auto;padding:var(--section) 0;border-bottom:1px solid var(--border)}.section h2{margin:0;font-size:clamp(2.25rem,4.4vw,4.3rem);line-height:1;letter-spacing:-.035em}.about-section,.info-section,.reserve-panel{display:grid;grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr);gap:clamp(28px,6vw,82px);align-items:start}.lede{margin:0;color:var(--muted);font-size:clamp(1.08rem,1.8vw,1.32rem);line-height:1.75}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:26px}.text-link{font:800 13px/1.2 ui-sans-serif,system-ui;color:var(--accent)}.gallery-card{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(250px,.55fr);overflow:hidden;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}.gallery-card img{width:100%;height:390px;object-fit:cover}.gallery-meta{display:flex;flex-direction:column;justify-content:flex-end;padding:26px}.gallery-meta strong{font-size:clamp(1.45rem,2.4vw,2.1rem);line-height:1.05}.gallery-meta span{margin-top:10px;color:var(--muted);font:600 14px/1.55 ui-sans-serif,system-ui}.info-card{border:1px solid var(--border);background:var(--surface);border-radius:var(--radius);padding:24px}.info-card span{text-transform:uppercase;letter-spacing:.14em;font:800 10px/1.3 ui-sans-serif,system-ui;color:var(--muted)}.info-card p{margin:10px 0 0;color:var(--muted);font:500 1rem/1.65 ui-sans-serif,system-ui;white-space:pre-line}.contact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.reserve-panel{align-items:center;padding:48px clamp(24px,5vw,58px);margin-top:var(--section);margin-bottom:var(--section);border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}.reserve-panel p:not(.kicker){color:var(--muted);font:500 1rem/1.7 ui-sans-serif,system-ui}.reserve-panel .button{justify-self:end}.site-footer{width:min(var(--max),calc(100% - 44px));margin:0 auto;padding:30px 0 44px;display:flex;justify-content:space-between;gap:20px;color:var(--muted);font:600 12px/1.5 ui-sans-serif,system-ui}.powered{opacity:.68}body[data-mode=\"minimal\"] .hero{grid-template-columns:1fr 1fr;min-height:470px}body[data-mode=\"minimal\"] .hero-media{height:440px}body[data-mode=\"minimal\"] .hero h1{font-size:clamp(2.8rem,5.4vw,5.2rem)}body[data-mode=\"social\"] .hero-media{height:540px}body[data-mode=\"social\"] .hero h1{font-family:Inter,ui-sans-serif,system-ui;font-weight:900}body[data-mode=\"warm\"] .hero-media{height:470px}body[data-mode=\"warm\"] .section{width:min(1080px,calc(100% - 44px))}@media(max-width:820px){.site-nav{padding:14px 18px}.nav-link.secondary{display:none}.hero{grid-template-columns:1fr;width:calc(100% - 32px);min-height:0;margin-top:20px;gap:22px}.hero-copy-column{padding:16px 0 0}.hero h1{font-size:clamp(2.8rem,13vw,4.6rem)}.hero-media,body[data-mode=\"minimal\"] .hero-media,body[data-mode=\"social\"] .hero-media,body[data-mode=\"warm\"] .hero-media{height:320px}.section{width:calc(100% - 32px);padding:56px 0}.about-section,.info-section,.reserve-panel,.gallery-card{grid-template-columns:1fr}.gallery-card img{height:280px}.gallery-meta{padding:20px}.contact-grid{grid-template-columns:1fr}.reserve-panel{width:calc(100% - 32px);margin:56px auto;padding:28px 22px}.reserve-panel .button{justify-self:start}.site-footer{width:calc(100% - 32px);flex-direction:column}}</style></head><body data-mode=\"${mode}\"><header class=\"site-nav\"><a class=\"brand\" href=\"/\">${businessName}</a><nav class=\"nav-actions\">${location.phone ? `<a class=\"nav-link secondary\" href=\"tel:${escapeHtml(location.phone)}\">Call</a>` : ""}${location.reservation_link ? `<a class=\"nav-link reserve\" href=\"${escapeHtml(location.reservation_link)}\" rel=\"noopener noreferrer\">Reserve</a>` : ""}</nav></header><main>${sections}</main><footer class=\"site-footer\"><span>${businessName}</span><span class=\"powered\">Website powered by TheOutHaven</span></footer></body></html>`;

  return [{ path: "index.html", content: html, encoding: "utf8" }];
}
