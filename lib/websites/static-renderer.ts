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

function directionTokens(website: BusinessWebsite) {
  const direction = stringValue(website.theme?.design_direction_id);
  const contrast = stringValue(website.theme?.contrast) || "dark";
  const typography = stringValue(website.theme?.typography) || "modern";
  const density = stringValue(website.theme?.density) || "balanced";

  const dark = contrast !== "light";
  const palettes: Record<string, { bg: string; surface: string; text: string; muted: string; accent: string; accentText: string; border: string }> = {
    refined_after_dark: { bg: "#09090b", surface: "#121217", text: "#f8f3ea", muted: "#b7afa3", accent: "#d6aa52", accentText: "#111111", border: "#2c2925" },
    cocktail_society: { bg: "#090809", surface: "#151014", text: "#f6efe9", muted: "#bcaea9", accent: "#d99a74", accentText: "#180d09", border: "#33242a" },
    editorial_luxury: { bg: "#f4f0e8", surface: "#fffdf8", text: "#1d1a18", muted: "#6d655d", accent: "#8a5a32", accentText: "#fffaf4", border: "#ded5c9" },
    modern_minimal: { bg: "#f7f7f5", surface: "#ffffff", text: "#151515", muted: "#666663", accent: "#171717", accentText: "#ffffff", border: "#deded8" },
    warm_neighborhood: { bg: "#f8f0e5", surface: "#fffaf3", text: "#302419", muted: "#746456", accent: "#a85235", accentText: "#fff8f1", border: "#e3d2bf" },
    classic_bistro: { bg: "#f2eee7", surface: "#faf7f1", text: "#231f1a", muted: "#6c6258", accent: "#7d2f2f", accentText: "#fff8f4", border: "#d8cec0" },
    bold_social: { bg: "#0d0d12", surface: "#171720", text: "#ffffff", muted: "#b6b3c4", accent: "#ffbe2e", accentText: "#17120a", border: "#302f3b" },
    coastal_airy: { bg: "#f4f8f7", surface: "#ffffff", text: "#183039", muted: "#64777d", accent: "#2f7f8b", accentText: "#ffffff", border: "#d5e2e1" },
    natural_retreat: { bg: "#f3f2ea", surface: "#faf9f3", text: "#253026", muted: "#697166", accent: "#667a57", accentText: "#ffffff", border: "#d8dccf" },
    creative_workshop: { bg: "#fff7ee", surface: "#ffffff", text: "#29201a", muted: "#786b61", accent: "#c45f42", accentText: "#ffffff", border: "#ead7c7" },
    wellness_escape: { bg: "#f4f7f3", surface: "#ffffff", text: "#23322c", muted: "#6b7b74", accent: "#718b7b", accentText: "#ffffff", border: "#d9e1dc" },
  };

  const fallback = dark
    ? { bg: "#0b0b0e", surface: "#141419", text: "#f8f8f7", muted: "#aaaab2", accent: "#f5b700", accentText: "#151515", border: "#2a2a31" }
    : { bg: "#f7f5f0", surface: "#ffffff", text: "#1b1b1b", muted: "#6b6b68", accent: "#8a5a32", accentText: "#ffffff", border: "#dedbd4" };

  return { ...(palettes[direction] || fallback), typography, density };
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
  const reserveLabel = escapeHtml(stringValue(generated.hero?.ctaLabel) || "Reserve now");

  switch (section.type) {
    case "hero":
      return `<section class=\"hero-shell\">${location.image_url ? `<img class=\"hero-image\" src=\"${escapeHtml(location.image_url)}\" alt=\"${name}\">` : ""}<div class=\"hero-shade\"></div><div class=\"hero-content\"><p class=\"eyebrow\">${escapeHtml(website.site_title || name)}</p><h1>${heading || name}</h1>${body ? `<p class=\"hero-copy\">${body}</p>` : ""}<div class=\"hero-actions\">${location.reservation_link ? `<a class=\"button primary\" href=\"${escapeHtml(location.reservation_link)}\" rel=\"noopener noreferrer\">${reserveLabel}</a>` : ""}${location.phone ? `<a class=\"button ghost\" href=\"tel:${escapeHtml(location.phone)}\">Call us</a>` : ""}</div></div></section>`;
    case "about":
      return `<section class=\"section section-split\"><div><p class=\"eyebrow\">Our story</p><h2>${heading || "About"}</h2></div><div>${body ? `<p class=\"lede\">${body}</p>` : `<p class=\"lede\">Discover what makes ${name} worth the trip.</p>`}</div></section>`;
    case "gallery":
      return location.image_url ? `<section class=\"section\"><div class=\"section-heading\"><p class=\"eyebrow\">The experience</p><h2>${heading || "A look inside"}</h2></div><div class=\"gallery\"><img src=\"${escapeHtml(location.image_url)}\" alt=\"${name}\"><div class=\"gallery-panel\"><span>Plan your visit</span><strong>${name}</strong><p>${escapeHtml(location.address || "Come experience it in person.")}</p></div></div></section>` : "";
    case "hours":
      return location.hours ? `<section class=\"section info-section\"><div><p class=\"eyebrow\">Plan ahead</p><h2>Hours</h2></div><div class=\"info-card\"><p>${escapeHtml(location.hours)}</p></div></section>` : "";
    case "reservations":
      return location.reservation_link ? `<section class=\"section cta-section\"><div><p class=\"eyebrow\">Make it happen</p><h2>${heading || "Ready to visit?"}</h2>${body ? `<p>${body}</p>` : ""}</div><a class=\"button primary\" href=\"${escapeHtml(location.reservation_link)}\" rel=\"noopener noreferrer\">${reserveLabel}</a></section>` : "";
    case "contact":
      return `<section class=\"section info-section\"><div><p class=\"eyebrow\">Find us</p><h2>${heading || "Visit"}</h2></div><div class=\"contact-grid\">${location.address ? `<div class=\"info-card\"><span>Address</span><p>${escapeHtml(location.address)}</p></div>` : ""}${location.phone ? `<div class=\"info-card\"><span>Phone</span><p><a href=\"tel:${escapeHtml(location.phone)}\">${escapeHtml(location.phone)}</a></p></div>` : ""}</div></section>`;
    default:
      return `<section class=\"section\">${heading ? `<h2>${heading}</h2>` : ""}${body ? `<p class=\"lede\">${body}</p>` : ""}</section>`;
  }
}

export function renderWebsiteArtifact(website: BusinessWebsite, location: LocationSnapshot): WebsiteArtifactFile[] {
  const generated = generatedContent(website);
  const tokens = directionTokens(website);
  const title = escapeHtml(stringValue(generated.seo?.title) || website.site_title || location.name || location.title || "Business");
  const description = escapeHtml(stringValue(generated.seo?.description) || `Visit ${location.name || location.title || website.site_title || "us"}.`);
  const businessName = escapeHtml(location.name || location.title || website.site_title || "Business");
  const sections = (website.sections || []).map((section) => sectionHtml(section, location, website, generated)).join("\n");
  const fontStack = tokens.typography === "editorial" ? "Georgia, 'Times New Roman', serif" : tokens.typography === "classic" ? "'Palatino Linotype', Palatino, Georgia, serif" : "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const sectionSpace = tokens.density === "airy" ? "clamp(72px,10vw,128px)" : tokens.density === "compact" ? "clamp(44px,6vw,72px)" : "clamp(56px,8vw,96px)";

  const html = `<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>${title}</title><meta name=\"description\" content=\"${description}\"><style>:root{--bg:${tokens.bg};--surface:${tokens.surface};--text:${tokens.text};--muted:${tokens.muted};--accent:${tokens.accent};--accentText:${tokens.accentText};--border:${tokens.border};--section:${sectionSpace}}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:${fontStack};line-height:1.6}a{color:inherit;text-decoration:none}img{display:block;max-width:100%}.site-nav{position:absolute;z-index:20;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:26px clamp(22px,5vw,72px);color:#fff}.brand{font-weight:800;letter-spacing:.04em}.nav-actions{display:flex;gap:10px}.nav-link{padding:10px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.28);font:700 13px/1 ui-sans-serif,system-ui}.hero-shell{position:relative;min-height:min(88vh,900px);display:flex;align-items:flex-end;overflow:hidden;background:var(--surface)}.hero-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.hero-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.18) 12%,rgba(0,0,0,.28) 45%,rgba(0,0,0,.78) 100%)}.hero-content{position:relative;z-index:2;width:min(1180px,100%);margin:0 auto;padding:160px clamp(22px,5vw,72px) clamp(54px,8vw,96px);color:#fff}.eyebrow{margin:0 0 14px;text-transform:uppercase;letter-spacing:.18em;font:800 12px/1.3 ui-sans-serif,system-ui;color:var(--accent)}.hero-content .eyebrow{color:#fff;opacity:.82}.hero-content h1{max-width:920px;margin:0;font-size:clamp(3.2rem,9vw,7.8rem);line-height:.92;letter-spacing:-.045em}.hero-copy{max-width:680px;margin:24px 0 0;font:500 clamp(1rem,2vw,1.28rem)/1.6 ui-sans-serif,system-ui;color:rgba(255,255,255,.88)}.hero-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 20px;border-radius:999px;font:800 14px/1 ui-sans-serif,system-ui;transition:transform .18s ease,opacity .18s ease}.button:hover{transform:translateY(-1px)}.button.primary{background:var(--accent);color:var(--accentText)}.button.ghost{border:1px solid rgba(255,255,255,.42);color:#fff;background:rgba(0,0,0,.18);backdrop-filter:blur(8px)}main{overflow:hidden}.section{width:min(1180px,calc(100% - 44px));margin:0 auto;padding:var(--section) 0;border-bottom:1px solid var(--border)}.section:last-child{border-bottom:0}.section h2{margin:0;font-size:clamp(2.3rem,5vw,4.8rem);line-height:1;letter-spacing:-.035em}.section-split,.info-section,.cta-section{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(28px,7vw,92px);align-items:start}.lede{margin:0;color:var(--muted);font-size:clamp(1.12rem,2vw,1.45rem);line-height:1.75}.section-heading{margin-bottom:30px}.gallery{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(260px,.7fr);gap:18px;align-items:stretch}.gallery img{width:100%;height:min(62vw,620px);object-fit:cover;border-radius:28px}.gallery-panel,.info-card{border:1px solid var(--border);background:var(--surface);border-radius:28px;padding:28px}.gallery-panel{display:flex;flex-direction:column;justify-content:flex-end;min-height:260px}.gallery-panel span,.info-card span{text-transform:uppercase;letter-spacing:.14em;font:800 11px/1.3 ui-sans-serif,system-ui;color:var(--muted)}.gallery-panel strong{display:block;margin-top:8px;font-size:clamp(1.6rem,3vw,2.6rem);line-height:1.05}.gallery-panel p,.info-card p{margin:12px 0 0;color:var(--muted);font:500 1rem/1.7 ui-sans-serif,system-ui}.contact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.cta-section{align-items:center}.cta-section>div>p:not(.eyebrow){color:var(--muted);font:500 1rem/1.7 ui-sans-serif,system-ui}.cta-section .button{justify-self:end}.site-footer{width:min(1180px,calc(100% - 44px));margin:0 auto;padding:34px 0 50px;display:flex;justify-content:space-between;gap:20px;color:var(--muted);font:600 13px/1.5 ui-sans-serif,system-ui}.powered{opacity:.7}@media(max-width:760px){.site-nav{padding:20px 18px}.nav-link.secondary{display:none}.hero-shell{min-height:78vh}.hero-content{padding:130px 22px 48px}.hero-content h1{font-size:clamp(3rem,15vw,5rem)}.section{width:min(100% - 36px,1180px)}.section-split,.info-section,.cta-section,.gallery{grid-template-columns:1fr}.gallery img{height:70vw;min-height:320px}.contact-grid{grid-template-columns:1fr}.cta-section .button{justify-self:start}.site-footer{width:calc(100% - 36px);flex-direction:column}}</style></head><body><header class=\"site-nav\"><a class=\"brand\" href=\"/\">${businessName}</a><nav class=\"nav-actions\">${location.phone ? `<a class=\"nav-link secondary\" href=\"tel:${escapeHtml(location.phone)}\">Call</a>` : ""}${location.reservation_link ? `<a class=\"nav-link\" href=\"${escapeHtml(location.reservation_link)}\" rel=\"noopener noreferrer\">Reserve</a>` : ""}</nav></header><main>${sections}</main><footer class=\"site-footer\"><span>${businessName}</span><span class=\"powered\">Website powered by TheOutHaven</span></footer></body></html>`;

  return [{ path: "index.html", content: html, encoding: "utf8" }];
}
