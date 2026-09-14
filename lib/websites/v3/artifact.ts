import "server-only";
import type { BusinessWebsite } from "@/lib/websites/data";
import type { GeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";

export type WebsiteV3PreviewPage = { id:string; label:string; path:string; html:string };
export type WebsiteV3PreviewArtifact = { defaultPage:string; pages:WebsiteV3PreviewPage[] };

export type V3PageProfile = {
  background:string; foreground:string; muted:string; accent:string; panel:string;
  serif:string; sans:string; radius:string; navStyle:"line"|"boxed"|"floating"|"minimal";
};

const esc=(v:unknown)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
const text=(v:unknown)=>typeof v==="string"&&v.trim()?v.trim():"";

function nameOf(website:BusinessWebsite,location:GeneratedWebsiteLocationSnapshot){return text(location.name)||text(location.title)||text(website.site_title)||"Your business"}
function photosOf(location:GeneratedWebsiteLocationSnapshot){return [...new Set([...location.photos,location.image_url].filter(Boolean) as string[])].slice(0,10)}
function footerContent(name:string,address?:string|null){return `<span>${esc(name)} · Website V3</span>${address?`<span style="display:block;margin-top:8px;letter-spacing:.08em;text-transform:none">${esc(address)}</span>`:""}`}
function normalizeHomeAddress(html:string,address?:string|null,name?:string){
  let next=html;
  const safe=address?esc(address):"";
  if(safe) next=next.split(safe).join("");
  const footer=footerContent(name||"Website",address);
  if(/<footer\b[^>]*>[\s\S]*?<\/footer>/i.test(next)) return next.replace(/<footer([^>]*)>[\s\S]*?<\/footer>/i,`<footer$1>${footer}</footer>`);
  return next.replace(/<\/body>/i,`<footer style="padding:26px 5vw;border-top:1px solid currentColor;opacity:.62;font-size:9px;letter-spacing:.13em;text-transform:uppercase">${footer}</footer></body>`);
}

function shell(profile:V3PageProfile,name:string,title:string,kicker:string,body:string,address?:string|null){
 const navClass=`nav ${profile.navStyle}`;
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ${esc(name)}</title><style>
 *{box-sizing:border-box}body{margin:0;background:${profile.background};color:${profile.foreground};font-family:${profile.sans};}a{color:inherit;text-decoration:none}img{display:block;width:100%;height:100%;object-fit:cover}.nav{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:24px 5vw;position:sticky;top:0;z-index:5;background:${profile.background}ee;backdrop-filter:blur(16px)}.nav.line{border-bottom:1px solid ${profile.foreground}22}.nav.boxed{margin:18px;border:1px solid ${profile.foreground}22;border-radius:${profile.radius};}.nav.floating{margin:18px;border-radius:999px;background:${profile.panel}f2;padding:16px 22px}.brand{font:600 12px/1 ${profile.sans};letter-spacing:.18em;text-transform:uppercase}.links{display:flex;gap:18px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${profile.muted}}.hero{padding:9vw 6vw 5vw}.kicker{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${profile.accent}}h1,h2,h3{font-family:${profile.serif};font-weight:400}.hero h1{font-size:clamp(58px,8vw,120px);line-height:.88;letter-spacing:-.045em;margin:14px 0 22px}.hero p{max-width:680px;color:${profile.muted};font-size:18px;line-height:1.7}.section{padding:4vw 6vw 8vw}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.card{border:1px solid ${profile.foreground}1f;border-radius:${profile.radius};overflow:hidden;background:${profile.panel}}.card .copy{padding:22px}.card h3{font-size:28px;margin:0}.card p{color:${profile.muted};line-height:1.6}.price{color:${profile.accent};font-weight:700}.gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.gallery figure{margin:0;aspect-ratio:4/3;border-radius:${profile.radius};overflow:hidden;background:${profile.panel}}.event{display:grid;grid-template-columns:180px 1fr;gap:22px;padding:18px 0;border-top:1px solid ${profile.foreground}1f}.event .thumb{aspect-ratio:4/3;border-radius:${profile.radius};overflow:hidden;background:${profile.panel}}.visit{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}.visit article{padding:24px;border:1px solid ${profile.foreground}1f;border-radius:${profile.radius};background:${profile.panel}}.visit span{font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:${profile.accent}}.visit p{white-space:pre-line;color:${profile.muted};line-height:1.6}.footer{padding:26px 5vw;border-top:1px solid ${profile.foreground}1f;color:${profile.muted};font-size:9px;letter-spacing:.13em;text-transform:uppercase}@media(max-width:760px){.links{display:none}.hero{padding:80px 24px 42px}.section{padding:24px 24px 70px}.grid,.gallery,.visit{grid-template-columns:1fr}.event{grid-template-columns:1fr}.event .thumb{max-width:320px}.nav.boxed,.nav.floating{margin:10px}}
 </style></head><body><nav class="${navClass}"><span class="brand">${esc(name)}</span><div class="links"><span>Home</span><span>Menu</span><span>Gallery</span><span>Events</span><span>Visit</span></div></nav><header class="hero"><span class="kicker">${esc(kicker)}</span><h1>${esc(title)}</h1></header>${body}<footer class="footer">${footerContent(name,address)}</footer></body></html>`;
}

export function buildV3PreviewArtifact(args:{homeHtml:string;website:BusinessWebsite;location:GeneratedWebsiteLocationSnapshot;profile:V3PageProfile;conceptName:string}):WebsiteV3PreviewArtifact{
 const {homeHtml,website,location,profile,conceptName}=args;const name=nameOf(website,location);const photos=photosOf(location);const address=location.address||null;
 const menuItems=(location.menu?.items||[]).slice(0,18).map(x=>`<article class="card"><div class="copy"><h3>${esc(x.name)}</h3>${x.description?`<p>${esc(x.description)}</p>`:""}${x.price?`<div class="price">${esc(x.price)}</div>`:""}</div></article>`).join("")||`<article class="card"><div class="copy"><h3>Menu coming soon</h3><p>Published menu items will appear here automatically.</p></div></article>`;
 const gallery=photos.map((src,i)=>`<figure><img src="${esc(src)}" alt="${esc(name)} gallery ${i+1}" loading="lazy"></figure>`).join("")||`<div class="card"><div class="copy"><h3>Gallery coming soon</h3><p>Add photos in Edit Location and they will appear here.</p></div></div>`;
 const offers=[...location.events.map(x=>({title:x.title,description:x.description,image:x.image_url,meta:"Event"})),...location.experiences.map(x=>({title:x.title,description:x.description,image:x.image_url,meta:"Experience"}))].slice(0,10);
 const events=offers.length?offers.map(x=>`<article class="event">${x.image?`<div class="thumb"><img src="${esc(x.image)}" alt="${esc(x.title)}"></div>`:""}<div><span class="kicker">${esc(x.meta)}</span><h3>${esc(x.title)}</h3>${x.description?`<p>${esc(x.description)}</p>`:""}</div></article>`).join(""):`<article class="card"><div class="copy"><h3>Nothing scheduled yet</h3><p>Published events and experiences will appear here automatically.</p></div></article>`;
 const visit=`<section class="section"><div class="visit"><article><span>Hours</span><p>${esc(location.hours||"Current hours update automatically.")}</p></article><article><span>Contact</span><h3>${esc(location.phone||"Reserve online")}</h3></article></div></section>`;
 return {defaultPage:"home",pages:[
  {id:"home",label:"Home",path:"index.html",html:normalizeHomeAddress(homeHtml,address,name)},
  {id:"menu",label:"Menu",path:"menu.html",html:shell(profile,name,location.menu?.title||"The Menu",conceptName,`<section class="section"><div class="grid">${menuItems}</div></section>`,address)},
  {id:"gallery",label:"Gallery",path:"gallery.html",html:shell(profile,name,"Gallery",conceptName,`<section class="section"><div class="gallery">${gallery}</div></section>`,address)},
  {id:"events",label:"Events",path:"events.html",html:shell(profile,name,"Events & Experiences",conceptName,`<section class="section">${events}</section>`,address)},
  {id:"visit",label:"Visit",path:"visit.html",html:shell(profile,name,"Plan Your Visit",conceptName,visit,address)},
 ]};
}
