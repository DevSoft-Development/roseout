import "server-only";
import type { BusinessWebsite, WebsiteSection } from "@/lib/websites/data";
import type { GeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";

export type PremiumRendererContext={website:BusinessWebsite;location:GeneratedWebsiteLocationSnapshot;name:string;photos:string[];hero:{heading:string;subheading:string}};

export function e(value:unknown){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;")}
export function text(value:unknown){return typeof value==="string"&&value.trim()?value.trim():""}
export function enabled(website:BusinessWebsite,type:WebsiteSection["type"]){return(website.sections||[]).find(s=>s.type===type&&s.enabled)||null}
export function makeContext(website:BusinessWebsite,location:GeneratedWebsiteLocationSnapshot):PremiumRendererContext{const generated=website.custom_content?.generated&&typeof website.custom_content.generated==="object"?website.custom_content.generated as any:{};const hero=generated.hero||{};const heroSection=enabled(website,"hero");const name=text(location.name)||text(location.title)||text(website.site_title)||"Business";const photos=location.photos.length?location.photos:(location.image_url?[location.image_url]:[]);return{website,location,name,photos,hero:{heading:text(hero.heading)||text(heroSection?.heading)||name,subheading:text(hero.subheading)||text(heroSection?.body)||text(location.short_description)||text(location.description)||"A destination worth making plans for."}}}
export function reserveHref(){return "/reservations/"}
export function sectionCopy(ctx:PremiumRendererContext,type:WebsiteSection["type"],fallbackHeading:string,fallbackBody=""){const s=enabled(ctx.website,type);return s?{heading:text(s.heading)||fallbackHeading,body:text(s.body)||fallbackBody}:null}
export function menuItems(ctx:PremiumRendererContext,limit=10){return ctx.location.menu?.items.slice(0,limit)||[]}
export function reviews(ctx:PremiumRendererContext,limit=4){return ctx.location.reviews.slice(0,limit)}
export function offerings(ctx:PremiumRendererContext,limit=6){return[...ctx.location.events.map(x=>({kind:"Event",title:x.title,image:x.image_url,meta:new Date(x.starts_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}),href:`https://theouthaven.com/events/${x.slug||x.id}`})),...ctx.location.experiences.map(x=>({kind:"Experience",title:x.title,image:x.image_url,meta:`${x.duration_minutes} min`,href:`https://theouthaven.com/experiences/${x.slug||x.id}`}))].slice(0,limit)}
export function document(title:string,body:string,css:string,bodyClass:string){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><style>*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0}img{display:block;max-width:100%}a{text-decoration:none;color:inherit}${css}</style></head><body class="${bodyClass}">${body}</body></html>`}
