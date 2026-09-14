import "server-only";

import type { BusinessWebsite } from "@/lib/websites/data";
import type { GeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function nameOf(website: BusinessWebsite, location: GeneratedWebsiteLocationSnapshot) {
  return text(location.name) || text(location.title) || text(website.site_title) || "Your business";
}

function photoList(location: GeneratedWebsiteLocationSnapshot) {
  const candidates = [...location.photos, location.image_url].filter(Boolean) as string[];
  return [...new Set(candidates)].slice(0, 8);
}

function reservationHref(location: GeneratedWebsiteLocationSnapshot) {
  if (location.uses_internal_reservations || location.internal_reservations_enabled) return "/reservations/";
  if (location.allow_external_reservations && location.reservation_link) return location.reservation_link;
  return "#visit";
}

function menuMarkup(location: GeneratedWebsiteLocationSnapshot) {
  if (!location.menu?.items.length) return "";
  const items = location.menu.items.slice(0, 8).map((item) => `
    <article class="menu-row">
      <div>
        <p class="menu-name">${esc(item.name)}</p>
        ${item.description ? `<p class="menu-desc">${esc(item.description)}</p>` : ""}
      </div>
      ${item.price ? `<span class="menu-price">${esc(item.price)}</span>` : ""}
    </article>`).join("");
  return `<section class="menu-section" id="menu">
    <div class="eyebrow">The menu</div>
    <div class="menu-head"><h2>${esc(location.menu.title || "A curated menu for the evening")}</h2><p>${esc(location.menu.description || "Signature dishes, drinks, and favorites selected from the current menu.")}</p></div>
    <div class="menu-list">${items}</div>
    ${location.menu.external_url ? `<a class="text-link" href="${esc(location.menu.external_url)}" target="_blank" rel="noreferrer">View full menu ↗</a>` : ""}
  </section>`;
}

function reviewsMarkup(location: GeneratedWebsiteLocationSnapshot) {
  if (!location.reviews.length) return "";
  const review = location.reviews[0];
  return `<section class="review-quote"><div class="quote-mark">“</div><blockquote>${esc(review.review_text)}</blockquote><p>${esc(review.customer_name)} · Verified guest</p></section>`;
}

function eventsMarkup(location: GeneratedWebsiteLocationSnapshot) {
  const cards = [
    ...location.events.slice(0, 2).map((event) => ({
      kind: "Event",
      title: event.title,
      image: event.image_url,
      meta: new Date(event.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      href: `https://theouthaven.com/events/${event.slug || event.id}`,
    })),
    ...location.experiences.slice(0, 2).map((experience) => ({
      kind: "Experience",
      title: experience.title,
      image: experience.image_url,
      meta: `${experience.duration_minutes} min`,
      href: `https://theouthaven.com/experiences/${experience.slug || experience.id}`,
    })),
  ];
  if (!cards.length) return "";
  return `<section class="happenings"><div class="section-title-row"><div><div class="eyebrow">Happening here</div><h2>Make a night of it.</h2></div></div><div class="happening-grid">${cards.map((card) => `<a class="happening-card" href="${esc(card.href)}" target="_blank" rel="noreferrer">${card.image ? `<img src="${esc(card.image)}" alt="${esc(card.title)}">` : ""}<div class="happening-copy"><span>${esc(card.kind)}</span><h3>${esc(card.title)}</h3><p>${esc(card.meta)}</p></div></a>`).join("")}</div></section>`;
}

export function renderNocturneV3Preview(website: BusinessWebsite, location: GeneratedWebsiteLocationSnapshot) {
  const name = nameOf(website, location);
  const photos = photoList(location);
  const hero = photos[0] || "";
  const second = photos[1] || hero;
  const third = photos[2] || second;
  const reserve = reservationHref(location);
  const description = text(location.short_description) || text(location.description) || `An evening at ${name}, designed to be remembered.`;
  const story = text(location.description) || description;
  const tags = [...location.best_for, ...location.special_features].slice(0, 4);
  const gallery = photos.slice(1, 6).map((src, index) => `<figure class="gallery-${index + 1}"><img src="${esc(src)}" alt="${esc(name)} atmosphere ${index + 1}" loading="lazy"></figure>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)}</title>
<style>
:root{--ink:#f4eee5;--muted:#b5aa9e;--bg:#090807;--panel:#12100e;--line:rgba(244,238,229,.16);--gold:#cfad74;--max:1360px}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-x:hidden}a{color:inherit;text-decoration:none}img{display:block;width:100%;height:100%;object-fit:cover}.shell{min-height:100vh;background:radial-gradient(circle at 80% 10%,rgba(120,80,45,.11),transparent 34%),var(--bg)}.nav{position:fixed;z-index:20;top:0;left:0;right:0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:26px 42px;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(4,3,3,.7),rgba(4,3,3,.04));backdrop-filter:blur(14px)}.brand{font-family:Georgia,"Times New Roman",serif;font-size:17px;letter-spacing:.12em;text-transform:uppercase}.nav-mid{display:flex;gap:26px;font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#e7ded3}.reserve-link{justify-self:end;border:1px solid rgba(255,255,255,.35);padding:12px 18px;font-size:10px;text-transform:uppercase;letter-spacing:.17em}.hero{position:relative;min-height:100vh;display:flex;align-items:flex-end;padding:150px 6vw 72px}.hero-bg{position:absolute;inset:0}.hero-bg:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,5,4,.9) 0%,rgba(7,5,4,.52) 45%,rgba(7,5,4,.12) 72%),linear-gradient(0deg,rgba(7,5,4,.86),transparent 46%)}.hero-bg img{filter:saturate(.78) contrast(1.05)}.hero-copy{position:relative;z-index:2;max-width:850px}.eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.28em;color:var(--gold);font-weight:700}.hero h1{margin:18px 0 20px;font-family:Georgia,"Times New Roman",serif;font-size:clamp(72px,10.8vw,180px);font-weight:400;line-height:.79;letter-spacing:-.055em}.hero p{max-width:620px;margin:0;color:#ded4ca;font-size:clamp(16px,1.5vw,22px);line-height:1.6}.hero-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}.btn{display:inline-flex;align-items:center;justify-content:center;padding:14px 20px;border:1px solid var(--line);font-size:11px;text-transform:uppercase;letter-spacing:.15em}.btn.primary{background:var(--ink);color:#0a0908;border-color:var(--ink)}.meta-strip{position:absolute;z-index:3;right:4vw;bottom:62px;display:grid;gap:6px;text-align:right}.meta-strip span{font-size:10px;text-transform:uppercase;letter-spacing:.17em;color:#cabdae}.meta-strip strong{font-family:Georgia,serif;font-weight:400;font-size:22px}.story-grid{width:min(var(--max),calc(100% - 12vw));margin:0 auto;padding:130px 0;display:grid;grid-template-columns:.8fr 1.2fr;gap:8vw;align-items:start}.story-grid h2,.menu-head h2,.happenings h2,.reserve-band h2{margin:0;font-family:Georgia,"Times New Roman",serif;font-weight:400;letter-spacing:-.035em}.story-grid h2{font-size:clamp(52px,7vw,102px);line-height:.9}.story-body{padding-top:18px}.story-body p{font-family:Georgia,serif;font-size:clamp(24px,2.6vw,39px);line-height:1.35;color:#e5dcd1;margin:0}.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:32px}.tags span{border:1px solid var(--line);border-radius:999px;padding:8px 12px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.12em}.image-break{width:min(1500px,100%);margin:0 auto;display:grid;grid-template-columns:1.5fr .5fr;gap:10px;padding:0 18px 110px}.image-break .large{height:min(72vw,820px)}.image-break .small{height:min(72vw,820px);padding-top:22%}.gallery{width:min(var(--max),calc(100% - 8vw));margin:0 auto;padding:20px 0 130px;display:grid;grid-template-columns:repeat(12,1fr);grid-auto-rows:110px;gap:10px}.gallery figure{margin:0;overflow:hidden;background:var(--panel)}.gallery-1{grid-column:1/7;grid-row:1/6}.gallery-2{grid-column:7/13;grid-row:2/8}.gallery-3{grid-column:2/6;grid-row:6/10}.gallery-4{grid-column:6/10;grid-row:8/12}.gallery-5{grid-column:10/13;grid-row:8/11}.menu-section{width:min(1120px,calc(100% - 12vw));margin:0 auto;padding:115px 0 130px;border-top:1px solid var(--line)}.menu-head{display:grid;grid-template-columns:1fr 1fr;gap:8vw;margin:18px 0 55px}.menu-head h2{font-size:clamp(48px,6vw,88px);line-height:.95}.menu-head p{margin:0;color:var(--muted);line-height:1.8;max-width:500px}.menu-list{border-top:1px solid var(--line)}.menu-row{display:grid;grid-template-columns:1fr auto;gap:40px;padding:22px 0;border-bottom:1px solid var(--line)}.menu-name{margin:0;font-family:Georgia,serif;font-size:26px}.menu-desc{margin:6px 0 0;color:var(--muted);font-size:13px;line-height:1.6;max-width:650px}.menu-price{font-size:14px;color:var(--gold);padding-top:5px}.text-link{display:inline-block;margin-top:28px;color:var(--gold);font-size:11px;text-transform:uppercase;letter-spacing:.13em}.review-quote{width:min(1000px,calc(100% - 12vw));margin:0 auto;padding:80px 0 135px;text-align:center}.quote-mark{font-family:Georgia,serif;color:var(--gold);font-size:80px;height:58px}.review-quote blockquote{margin:0 auto;max-width:880px;font-family:Georgia,serif;font-size:clamp(34px,4.8vw,70px);font-weight:400;line-height:1.12}.review-quote p{margin-top:24px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.15em}.happenings{width:min(var(--max),calc(100% - 8vw));margin:0 auto;padding:110px 0 140px}.section-title-row{margin-bottom:40px}.happenings h2{font-size:clamp(48px,6vw,86px)}.happening-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.happening-card{position:relative;min-height:520px;overflow:hidden;background:var(--panel)}.happening-card:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.8),rgba(0,0,0,.04) 60%)}.happening-copy{position:absolute;z-index:2;left:28px;right:28px;bottom:28px}.happening-copy span{font-size:9px;text-transform:uppercase;letter-spacing:.18em;color:var(--gold)}.happening-copy h3{margin:9px 0 4px;font-family:Georgia,serif;font-weight:400;font-size:38px}.happening-copy p{margin:0;color:#d5cdc4;font-size:12px}.reserve-band{width:min(var(--max),calc(100% - 6vw));margin:0 auto 30px;min-height:440px;display:grid;grid-template-columns:1fr 1fr;overflow:hidden;background:#d8c3a3;color:#17120e}.reserve-copy{padding:70px}.reserve-band h2{font-size:clamp(54px,6vw,92px);line-height:.9}.reserve-copy p{max-width:520px;line-height:1.7;color:#4f4338}.reserve-band .btn{border-color:#17120e}.reserve-band .btn.primary{background:#17120e;color:#f7efe4}.reserve-image{min-height:440px}.visit{width:min(var(--max),calc(100% - 8vw));margin:0 auto;padding:100px 0 120px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px;border-top:1px solid var(--line)}.visit-label{font-size:9px;text-transform:uppercase;letter-spacing:.2em;color:var(--gold)}.visit h3,.visit p{margin:10px 0 0;font-family:Georgia,serif;font-weight:400;font-size:24px;line-height:1.4;white-space:pre-line}.footer{display:flex;justify-content:space-between;gap:20px;padding:28px 4vw;border-top:1px solid var(--line);color:#877e75;font-size:10px;text-transform:uppercase;letter-spacing:.12em}@media(max-width:900px){.nav{grid-template-columns:1fr auto;padding:20px}.nav-mid{display:none}.hero{padding:130px 24px 50px}.hero h1{font-size:clamp(66px,18vw,120px)}.meta-strip{display:none}.story-grid,.menu-head,.reserve-band{grid-template-columns:1fr}.story-grid{width:calc(100% - 48px);padding:90px 0}.image-break{grid-template-columns:1fr;padding:0 12px 70px}.image-break .large,.image-break .small{height:68vh;padding:0}.gallery{width:calc(100% - 24px);grid-template-columns:1fr;grid-auto-rows:auto;padding-bottom:80px}.gallery figure,.gallery-1,.gallery-2,.gallery-3,.gallery-4,.gallery-5{grid-column:auto;grid-row:auto;height:52vh}.menu-section,.review-quote,.happenings{width:calc(100% - 48px);padding-top:80px;padding-bottom:90px}.happening-grid{grid-template-columns:1fr}.happening-card{min-height:430px}.reserve-band{width:calc(100% - 24px)}.reserve-copy{padding:42px 28px}.reserve-image{min-height:360px}.visit{width:calc(100% - 48px);grid-template-columns:1fr;padding:70px 0}.footer{flex-direction:column}.brand{font-size:13px}}
</style></head><body><div class="shell">
<header class="nav"><a class="brand" href="#top">${esc(name)}</a><nav class="nav-mid"><a href="#story">Story</a><a href="#gallery">Gallery</a><a href="#menu">Menu</a><a href="#visit">Visit</a></nav><a class="reserve-link" href="${esc(reserve)}">Reserve</a></header>
<section class="hero" id="top"><div class="hero-bg">${hero ? `<img src="${esc(hero)}" alt="${esc(name)}">` : ""}</div><div class="hero-copy"><div class="eyebrow">${esc(location.address || "An evening worth planning")}</div><h1>${esc(name)}</h1><p>${esc(description)}</p><div class="hero-actions"><a class="btn primary" href="${esc(reserve)}">Reserve a table</a><a class="btn" href="#menu">Explore the menu</a></div></div><div class="meta-strip"><span>Best for</span><strong>${esc(tags.slice(0, 2).join(" · ") || "Dinner · Drinks")}</strong></div></section>
<section class="story-grid" id="story"><div><div class="eyebrow">The story</div><h2>Stay for the atmosphere.</h2></div><div class="story-body"><p>${esc(story)}</p>${tags.length ? `<div class="tags">${tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>` : ""}</div></section>
${second ? `<section class="image-break"><div class="large"><img src="${esc(second)}" alt="${esc(name)} interior"></div><div class="small">${third ? `<img src="${esc(third)}" alt="${esc(name)} detail">` : ""}</div></section>` : ""}
${gallery ? `<section class="gallery" id="gallery">${gallery}</section>` : ""}
${menuMarkup(location)}
${eventsMarkup(location)}
${reviewsMarkup(location)}
<section class="reserve-band" id="reserve"><div class="reserve-copy"><div class="eyebrow" style="color:#6d5637">Reservations</div><h2>Your table is waiting.</h2><p>${esc(location.reservation_provider ? `Reserve through ${location.reservation_provider}, or choose the time that works best for your evening.` : `Choose the time that works best and make ${name} part of your night.`)}</p><div class="hero-actions"><a class="btn primary" href="${esc(reserve)}">Reserve now</a>${location.phone ? `<a class="btn" href="tel:${esc(location.phone)}">Call ${esc(location.phone)}</a>` : ""}</div></div><div class="reserve-image">${hero ? `<img src="${esc(photos[3] || hero)}" alt="${esc(name)} reservation atmosphere">` : ""}</div></section>
<section class="visit" id="visit"><div><div class="visit-label">Address</div><h3>${esc(location.address || "See location details")}</h3></div><div><div class="visit-label">Hours</div><p>${esc(location.hours || "Current hours update automatically.")}</p></div><div><div class="visit-label">Contact</div><h3>${esc(location.phone || "Contact the location")}</h3></div></section>
<footer class="footer"><span>${esc(name)}</span><span>Website powered by TheOutHaven</span></footer>
</div></body></html>`;
}
