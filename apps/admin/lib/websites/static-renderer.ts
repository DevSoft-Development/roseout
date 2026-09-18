import "server-only";

import type { BusinessWebsite, WebsiteSection } from "@/lib/websites/data";
import type { WebsiteArtifactFile } from "@/lib/websites/publish-contract";
import { getWebsiteCompositionProfile } from "@/lib/websites/composition-profiles";
import { normalizeWebsiteDesignDirectionId } from "@/lib/websites/design-directions";

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
  surface2: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  border: string;
  displayFont: string;
  bodyFont: string;
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

function directionTokens(id: string): Tokens {
  const editorial = "Georgia, 'Times New Roman', serif";
  const classic = "'Palatino Linotype', Palatino, Georgia, serif";
  const modern = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const palettes: Record<string, Tokens> = {
    editorial_luxury: { bg: "#f2ede4", surface: "#fbf8f2", surface2: "#e8dfd2", text: "#211d19", muted: "#71685f", accent: "#82583a", accentText: "#fffaf4", border: "#d5c9ba", displayFont: editorial, bodyFont: modern },
    refined_after_dark: { bg: "#090909", surface: "#121212", surface2: "#1b1815", text: "#f4efe7", muted: "#aaa197", accent: "#c89c58", accentText: "#120e09", border: "#2a2723", displayFont: editorial, bodyFont: modern },
    modern_minimal: { bg: "#f4f4f1", surface: "#ffffff", surface2: "#e9e9e4", text: "#151515", muted: "#686864", accent: "#151515", accentText: "#ffffff", border: "#d9d9d2", displayFont: modern, bodyFont: modern },
    bold_social: { bg: "#0e0e12", surface: "#17171d", surface2: "#24232d", text: "#ffffff", muted: "#bab7c5", accent: "#f4bc41", accentText: "#151108", border: "#35343f", displayFont: modern, bodyFont: modern },
    classic_bistro: { bg: "#eee8df", surface: "#f8f4ed", surface2: "#dfd5c8", text: "#251f1a", muted: "#6e6359", accent: "#78302e", accentText: "#fff9f5", border: "#cfc3b5", displayFont: classic, bodyFont: classic },
    coastal_airy: { bg: "#edf4f2", surface: "#fbfdfc", surface2: "#dceae7", text: "#173239", muted: "#647a7e", accent: "#2f7881", accentText: "#ffffff", border: "#ccdedb", displayFont: modern, bodyFont: modern },
    warm_neighborhood: { bg: "#f3e9dc", surface: "#fff9f1", surface2: "#e9d8c5", text: "#33261d", muted: "#76685c", accent: "#a24e35", accentText: "#fffaf5", border: "#dbc9b5", displayFont: classic, bodyFont: modern },
    luxury_minimal: { bg: "#f5f2eb", surface: "#faf8f3", surface2: "#e9e3d8", text: "#191816", muted: "#77716a", accent: "#6e5b45", accentText: "#ffffff", border: "#d8d0c4", displayFont: editorial, bodyFont: modern },
    experiential_escape: { bg: "#111317", surface: "#191d22", surface2: "#222a31", text: "#f7f8f8", muted: "#afb7bd", accent: "#e7b547", accentText: "#16120a", border: "#313840", displayFont: modern, bodyFont: modern },
    creative_workshop: { bg: "#fff3e7", surface: "#fffaf5", surface2: "#f3dfca", text: "#2d2119", muted: "#77675b", accent: "#c2543b", accentText: "#ffffff", border: "#e4ccb6", displayFont: modern, bodyFont: modern },
  };
  return palettes[id] || palettes.modern_minimal;
}

function sectionCopy(section: WebsiteSection, generated: GeneratedContent) {
  if (section.type === "hero") return { heading: stringValue(generated.hero?.heading) || stringValue(section.heading), body: stringValue(generated.hero?.subheading) || stringValue(section.body) };
  if (section.type === "about") return { heading: stringValue(generated.about?.heading) || stringValue(section.heading) || "Our story", body: stringValue(generated.about?.body) || stringValue(section.body) };
  return { heading: stringValue(section.heading), body: stringValue(section.body) };
}

function reservationWidget(location: LocationSnapshot, heading = "Make a reservation") {
  const name = escapeHtml(location.name || location.title || "this location");
  const src = `https://www.theouthaven.com/embed/reservations/${encodeURIComponent(location.id)}`;
  return `<section class="reservation-section" id="reserve"><div class="reservation-shell"><div class="reservation-intro"><p class="eyebrow">Reservations</p><h2>${escapeHtml(heading)}</h2><p>Choose your party size, date, and an available time without leaving ${name}.</p><div class="reservation-trust"><span>Live availability</span><span>Secure booking</span></div></div><div class="reservation-frame-shell"><iframe class="reservation-frame" src="${src}" title="Reserve ${name}" loading="eager"></iframe></div></div></section>`;
}

function heroHtml(section: WebsiteSection, location: LocationSnapshot, website: BusinessWebsite, generated: GeneratedContent, heroStyle: string) {
  const name = escapeHtml(location.name || location.title || website.site_title || "Business");
  const copy = sectionCopy(section, generated);
  const heading = escapeHtml(copy.heading || name);
  const body = escapeHtml(copy.body);
  const image = stringValue(location.image_url);
  const secondary = location.phone ? `<a class="button ghost" href="tel:${escapeHtml(location.phone)}">Call</a>` : "";
  const media = image ? `<figure class="hero-media"><img src="${escapeHtml(image)}" alt="${name}"><figcaption>${location.address ? escapeHtml(location.address) : "Plan your visit"}</figcaption></figure>` : "";
  return `<section class="hero hero-${escapeHtml(heroStyle)}"><div class="hero-copy"><p class="eyebrow">${name}</p><h1>${heading}</h1>${body ? `<p class="hero-deck">${body}</p>` : ""}<div class="hero-actions"><a class="button primary" href="#reserve">Reserve</a>${secondary}</div></div>${media}<a class="hero-reserve-prompt" href="#reserve"><span>Reserve your visit</span><strong>Choose a date & time →</strong></a></section>`;
}

function contentSectionHtml(section: WebsiteSection, location: LocationSnapshot, website: BusinessWebsite, generated: GeneratedContent, allowGalleryImage: boolean) {
  if (!section.enabled) return "";
  const name = escapeHtml(location.name || location.title || website.site_title || "Business");
  const copy = sectionCopy(section, generated);
  const heading = escapeHtml(copy.heading);
  const body = escapeHtml(copy.body);

  if (section.type === "about") {
    return `<section class="content-section about-section"><div class="section-label"><p class="eyebrow">The place</p><span>01</span></div><div class="section-copy"><h2>${heading || "A place worth making plans for"}</h2><p class="lede">${body || `Discover ${name}, then reserve the time that works for you.`}</p><a class="quiet-link" href="#reserve">Plan your visit →</a></div></section>`;
  }
  if (section.type === "gallery") {
    if (!allowGalleryImage || !location.image_url) return "";
    return `<section class="content-section gallery-section"><div class="section-label"><p class="eyebrow">The experience</p><span>02</span></div><div class="gallery-stage"><img src="${escapeHtml(location.image_url)}" alt="${name}"><div class="gallery-caption"><strong>${name}</strong><span>${escapeHtml(location.address || "Visit us")}</span></div></div></section>`;
  }
  if (section.type === "hours") {
    if (!location.hours) return "";
    return `<section class="content-section detail-section"><div class="section-label"><p class="eyebrow">Plan ahead</p><span>03</span></div><div class="detail-panel"><h2>Hours</h2><p>${escapeHtml(location.hours)}</p><a class="button primary compact" href="#reserve">Reserve a time</a></div></section>`;
  }
  if (section.type === "contact") {
    if (!location.address && !location.phone) return "";
    return `<section class="content-section visit-section"><div class="section-label"><p class="eyebrow">Visit</p><span>04</span></div><div class="visit-grid">${location.address ? `<article><span>Address</span><h3>${escapeHtml(location.address)}</h3></article>` : ""}${location.phone ? `<article><span>Phone</span><h3><a href="tel:${escapeHtml(location.phone)}">${escapeHtml(location.phone)}</a></h3></article>` : ""}<article class="visit-cta"><span>Ready?</span><h3><a href="#reserve">Reserve your table →</a></h3></article></div></section>`;
  }
  if (section.type === "reservations") return reservationWidget(location, heading || "Make a reservation");
  if (section.type === "hero") return "";
  return `<section class="content-section generic-section"><div class="section-copy">${heading ? `<h2>${heading}</h2>` : ""}${body ? `<p class="lede">${body}</p>` : ""}</div></section>`;
}

function orderedSections(website: BusinessWebsite, profileOrder: string[]) {
  const enabled = (website.sections || []).filter((section) => section.enabled);
  const rank = new Map(profileOrder.map((type, index) => [type, index]));
  return [...enabled].sort((a, b) => (rank.get(a.type) ?? 99) - (rank.get(b.type) ?? 99));
}

export function renderWebsiteArtifact(website: BusinessWebsite, location: LocationSnapshot): WebsiteArtifactFile[] {
  const generated = generatedContent(website);
  const rawDirection = stringValue(website.theme?.design_direction_id) || "modern_minimal";
  const directionId = normalizeWebsiteDesignDirectionId(rawDirection);
  const profile = getWebsiteCompositionProfile(directionId);
  const tokens = directionTokens(profile.id);
  const title = escapeHtml(stringValue(generated.seo?.title) || website.site_title || location.name || location.title || "Business");
  const description = escapeHtml(stringValue(generated.seo?.description) || `Visit ${location.name || location.title || website.site_title || "us"}.`);
  const businessName = escapeHtml(location.name || location.title || website.site_title || "Business");
  const sections = orderedSections(website, profile.sectionOrder);
  const heroSection = sections.find((section) => section.type === "hero") || ({ id: "hero", type: "hero", enabled: true } as WebsiteSection);
  const hero = heroHtml(heroSection, location, website, generated, profile.hero);
  const hasSingleCanonicalImage = Boolean(stringValue(location.image_url));
  const bodySections = sections
    .filter((section) => section.type !== "hero")
    .map((section) => contentSectionHtml(section, location, website, generated, !hasSingleCanonicalImage))
    .join("\n");
  const hasReservation = sections.some((section) => section.type === "reservations");
  const reservationFallback = hasReservation ? "" : reservationWidget(location);
  const navClass = `nav-${profile.nav}`;
  const ruleClass = `rule-${profile.sectionRule}`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${tokens.bg}"><title>${title}</title><meta name="description" content="${description}"><style>
:root{--bg:${tokens.bg};--surface:${tokens.surface};--surface2:${tokens.surface2};--text:${tokens.text};--muted:${tokens.muted};--accent:${tokens.accent};--accentText:${tokens.accentText};--border:${tokens.border};--display:${tokens.displayFont};--body:${tokens.bodyFont};--max:${profile.maxWidth};--radius:${profile.radius};--displayScale:${profile.displayScale};--tracking:${profile.eyebrowTracking};--imageRatio:${profile.imageRatio}}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--body);line-height:1.55;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}img{display:block;width:100%}.site-nav{position:sticky;top:0;z-index:80;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px max(24px,calc((100vw - var(--max))/2));transition:.2s}.nav-solid{background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(18px)}.nav-bordered{background:color-mix(in srgb,var(--bg) 94%,transparent);backdrop-filter:blur(18px);border-bottom:1px solid var(--border)}.nav-transparent{background:color-mix(in srgb,var(--bg) 78%,transparent);backdrop-filter:blur(18px)}.brand{font:850 14px/1 var(--body);letter-spacing:.03em}.nav-actions{display:flex;align-items:center;gap:10px}.nav-link{padding:11px 17px;border:1px solid var(--border);border-radius:999px;font:800 12px/1 var(--body)}.nav-link.reserve{background:var(--accent);border-color:var(--accent);color:var(--accentText)}main{overflow:hidden}.hero{width:min(var(--max),calc(100% - 48px));margin:0 auto;position:relative;min-height:680px;padding:clamp(70px,9vw,130px) 0;display:grid;align-items:center;gap:clamp(38px,6vw,90px)}.hero-copy{position:relative;z-index:2}.eyebrow{margin:0 0 18px;color:var(--accent);text-transform:uppercase;letter-spacing:var(--tracking);font:850 10px/1.2 var(--body)}.hero h1{margin:0;font-family:var(--display);font-size:var(--displayScale);font-weight:500;line-height:.88;letter-spacing:-.055em;max-width:920px}.hero-deck{max-width:600px;margin:28px 0 0;color:var(--muted);font-size:clamp(1rem,1.5vw,1.22rem);line-height:1.72}.hero-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:32px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 22px;border-radius:999px;font:850 12px/1 var(--body);letter-spacing:.01em}.button.primary{background:var(--accent);color:var(--accentText)}.button.ghost{border:1px solid var(--border);background:color-mix(in srgb,var(--surface) 64%,transparent)}.button.compact{min-height:44px;margin-top:22px}.hero-media{margin:0;position:relative;overflow:hidden;border-radius:var(--radius);background:var(--surface);border:1px solid var(--border);aspect-ratio:var(--imageRatio)}.hero-media img{height:100%;object-fit:cover}.hero-media figcaption{position:absolute;left:18px;bottom:16px;max-width:80%;padding:8px 11px;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(12px);border-radius:999px;font:750 10px/1.2 var(--body)}.hero-reserve-prompt{display:none}.hero-split,.hero-framed,.hero-playful{grid-template-columns:minmax(0,1fr) minmax(340px,.9fr)}.hero-editorial{grid-template-columns:minmax(0,1.25fr) minmax(300px,.65fr)}.hero-editorial .hero-media{align-self:end;transform:translateY(38px)}.hero-offset{grid-template-columns:minmax(0,1.1fr) minmax(320px,.7fr);min-height:760px}.hero-offset .hero-media{transform:translateY(58px)}.hero-offset:after{content:"";position:absolute;width:38%;height:48%;right:9%;top:16%;border:1px solid var(--border);pointer-events:none}.hero-reservation{grid-template-columns:minmax(0,1fr) minmax(320px,.75fr);min-height:570px}.hero-reservation .hero-reserve-prompt{display:flex;position:absolute;right:0;bottom:22px;width:min(440px,42%);align-items:center;justify-content:space-between;gap:20px;padding:20px 22px;background:var(--accent);color:var(--accentText);border-radius:var(--radius);font:750 12px/1.2 var(--body)}.hero-reservation .hero-reserve-prompt strong{font-weight:900}.hero-centered,.hero-minimal{grid-template-columns:1fr;text-align:center;justify-items:center;min-height:720px}.hero-centered .hero-copy,.hero-minimal .hero-copy{max-width:980px}.hero-centered .hero-deck,.hero-minimal .hero-deck{margin-left:auto;margin-right:auto}.hero-centered .hero-actions,.hero-minimal .hero-actions{justify-content:center}.hero-minimal .hero-media{width:min(820px,76%);aspect-ratio:3/1;margin-top:8px}.hero-story{grid-template-columns:minmax(280px,.72fr) minmax(0,1.25fr)}.hero-story .hero-copy{order:2}.hero-story .hero-media{order:1}.hero-experience{grid-template-columns:minmax(0,.8fr) minmax(420px,1.2fr);min-height:720px}.hero-experience .hero-media{aspect-ratio:16/11}.hero-playful .hero-media{transform:rotate(1.5deg);box-shadow:18px 18px 0 var(--surface2)}.reservation-section{width:100%;padding:clamp(56px,7vw,96px) 24px;background:var(--surface)}.reservation-shell{width:min(var(--max),100%);margin:0 auto;display:grid;grid-template-columns:minmax(260px,.58fr) minmax(0,1.42fr);gap:clamp(32px,6vw,84px);align-items:start}.reservation-intro{position:sticky;top:110px;padding-top:12px}.reservation-intro h2,.content-section h2{margin:0;font-family:var(--display);font-weight:500;font-size:clamp(2.7rem,5vw,5.1rem);line-height:.95;letter-spacing:-.045em}.reservation-intro>p:not(.eyebrow){margin:22px 0 0;color:var(--muted);line-height:1.7}.reservation-trust{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}.reservation-trust span{padding:8px 10px;border:1px solid var(--border);border-radius:999px;font:800 10px/1 var(--body);color:var(--muted)}.reservation-frame-shell{overflow:hidden;min-height:470px;border:1px solid var(--border);background:var(--bg);border-radius:var(--radius);box-shadow:0 28px 70px rgba(0,0,0,.08)}.reservation-frame{display:block;width:100%;height:610px;border:0;background:transparent}.content-section{width:min(var(--max),calc(100% - 48px));margin:0 auto;padding:clamp(78px,10vw,145px) 0;display:grid;grid-template-columns:minmax(150px,.34fr) minmax(0,1.66fr);gap:clamp(28px,7vw,110px)}.rule-line{border-bottom:1px solid var(--border)}.rule-soft .content-section{border-bottom:1px solid color-mix(in srgb,var(--border) 55%,transparent)}.section-label{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;color:var(--muted);font:800 10px/1 var(--body)}.section-label span{opacity:.45}.section-copy{max-width:850px}.lede{margin:24px 0 0;color:var(--muted);font-size:clamp(1.12rem,2vw,1.52rem);line-height:1.72}.quiet-link{display:inline-block;margin-top:30px;padding-bottom:4px;border-bottom:1px solid var(--accent);color:var(--accent);font:850 11px/1.3 var(--body);text-transform:uppercase;letter-spacing:.08em}.detail-panel{max-width:760px;padding:clamp(28px,5vw,56px);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}.detail-panel p{white-space:pre-line;color:var(--muted);font-size:1.05rem;line-height:1.8}.visit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}.visit-grid article{min-height:180px;padding:30px;background:var(--surface)}.visit-grid span{display:block;margin-bottom:20px;color:var(--muted);text-transform:uppercase;letter-spacing:.16em;font:800 10px/1 var(--body)}.visit-grid h3{margin:0;font-family:var(--display);font-size:clamp(1.35rem,2.4vw,2.35rem);font-weight:500;line-height:1.12}.visit-cta{background:var(--accent)!important;color:var(--accentText)}.visit-cta span{color:inherit;opacity:.72}.gallery-stage{position:relative;overflow:hidden;border-radius:var(--radius);aspect-ratio:16/9}.gallery-stage img{height:100%;object-fit:cover}.gallery-caption{position:absolute;left:22px;right:22px;bottom:20px;display:flex;justify-content:space-between;gap:20px;padding:16px 18px;background:color-mix(in srgb,var(--bg) 84%,transparent);backdrop-filter:blur(14px);font-size:12px}.site-footer{width:min(var(--max),calc(100% - 48px));margin:0 auto;padding:42px 0 105px;display:flex;align-items:flex-end;justify-content:space-between;gap:30px}.footer-brand{font-family:var(--display);font-size:clamp(1.8rem,3.5vw,3.5rem);font-weight:500}.footer-meta{max-width:460px;text-align:right;color:var(--muted);font-size:12px}.mobile-reserve{display:none}
@media(max-width:820px){.site-nav{padding:14px 18px}.nav-link:not(.reserve){display:none}.hero{width:min(100% - 32px,var(--max));min-height:auto;padding:64px 0 52px;grid-template-columns:1fr!important;gap:34px}.hero h1{font-size:clamp(3.25rem,16vw,5.4rem)}.hero-media{width:100%!important;transform:none!important;aspect-ratio:4/3!important}.hero-offset:after{display:none}.hero-story .hero-copy,.hero-story .hero-media{order:initial}.hero-reservation .hero-reserve-prompt{display:none}.reservation-section{padding:58px 16px}.reservation-shell{grid-template-columns:1fr;gap:30px}.reservation-intro{position:static}.reservation-frame-shell{min-height:540px}.reservation-frame{height:640px}.content-section{width:calc(100% - 32px);padding:72px 0;grid-template-columns:1fr;gap:26px}.section-label{max-width:120px}.visit-grid{grid-template-columns:1fr}.visit-grid article{min-height:140px}.site-footer{width:calc(100% - 32px);padding-bottom:105px;display:block}.footer-meta{text-align:left;margin-top:20px}.mobile-reserve{position:fixed;z-index:100;display:flex;left:12px;right:12px;bottom:12px;min-height:58px;align-items:center;justify-content:center;border-radius:999px;background:var(--accent);color:var(--accentText);box-shadow:0 12px 38px rgba(0,0,0,.24);font:900 14px/1 var(--body)}}
</style></head><body class="composition-${profile.id} ${ruleClass}"><header class="site-nav ${navClass}"><a class="brand" href="#top">${businessName}</a><nav class="nav-actions"><a class="nav-link" href="#visit">Visit</a><a class="nav-link reserve" href="#reserve">Reserve</a></nav></header><main id="top">${hero}${bodySections}${reservationFallback}</main><footer class="site-footer" id="visit"><div><p class="eyebrow">${businessName}</p><div class="footer-brand">Make a plan. Make it yours.</div></div><div class="footer-meta">${location.address ? `<div>${escapeHtml(location.address)}</div>` : ""}${location.phone ? `<div><a href="tel:${escapeHtml(location.phone)}">${escapeHtml(location.phone)}</a></div>` : ""}<div>Reservations powered by TheOutHaven</div></div></footer><a class="mobile-reserve" href="#reserve">Reserve</a></body></html>`;

  return [{ path: "index.html", content: html, contentType: "text/html; charset=utf-8" }];
}
