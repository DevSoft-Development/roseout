import "server-only";

import type { BusinessWebsite } from "@/lib/websites/data";

type HeroLayout = "cinema" | "editorial" | "mosaic" | "poster" | "split" | "stack" | "stage" | "story" | "panorama" | "type";
type NavLayout = "overlay" | "rail" | "centered" | "utility" | "boxed" | "minimal" | "floating";
type GalleryLayout = "mosaic" | "filmstrip" | "masonry" | "editorial" | "panorama" | "polaroid" | "stack" | "grid";
type MenuLayout = "ledger" | "cards" | "columns" | "board" | "split" | "compact";
type ReviewLayout = "marquee" | "cards" | "editorial" | "sidebar" | "minimal";
type ReserveLayout = "band" | "split" | "dock" | "panel" | "stage";
type FrameLayout = "edge" | "boxed" | "inset" | "editorial" | "layered";
type Motif = "none" | "lines" | "rings" | "grid" | "glow" | "arches" | "dots" | "ticket" | "stamp" | "wave";
type Motion = "reveal" | "drift" | "parallax" | "snap" | "marquee" | "float";

export type AgencyTemplateSignature = {
  hero: HeroLayout;
  nav: NavLayout;
  gallery: GalleryLayout;
  menu: MenuLayout;
  reviews: ReviewLayout;
  reserve: ReserveLayout;
  frame: FrameLayout;
  motif: Motif;
  motion: Motion;
};

const s = (signature: AgencyTemplateSignature) => signature;

/**
 * Every direction has a deliberately unique combination. The shared content engine stays
 * canonical, while composition, movement and conversion hierarchy differ like agency-built sites.
 */
export const AGENCY_TEMPLATE_SIGNATURES: Record<string, AgencyTemplateSignature> = {
  editorial_luxury:s({hero:"editorial",nav:"minimal",gallery:"editorial",menu:"ledger",reviews:"editorial",reserve:"split",frame:"editorial",motif:"lines",motion:"reveal"}),
  refined_after_dark:s({hero:"cinema",nav:"overlay",gallery:"filmstrip",menu:"split",reviews:"marquee",reserve:"dock",frame:"edge",motif:"glow",motion:"parallax"}),
  modern_minimal:s({hero:"split",nav:"floating",gallery:"grid",menu:"columns",reviews:"minimal",reserve:"panel",frame:"boxed",motif:"none",motion:"reveal"}),
  bold_social:s({hero:"mosaic",nav:"utility",gallery:"mosaic",menu:"cards",reviews:"marquee",reserve:"band",frame:"edge",motif:"rings",motion:"float"}),
  classic_bistro:s({hero:"story",nav:"centered",gallery:"editorial",menu:"ledger",reviews:"sidebar",reserve:"split",frame:"inset",motif:"stamp",motion:"reveal"}),
  coastal_airy:s({hero:"panorama",nav:"minimal",gallery:"panorama",menu:"columns",reviews:"cards",reserve:"band",frame:"edge",motif:"wave",motion:"drift"}),
  warm_neighborhood:s({hero:"split",nav:"boxed",gallery:"polaroid",menu:"cards",reviews:"cards",reserve:"panel",frame:"boxed",motif:"stamp",motion:"float"}),
  luxury_minimal:s({hero:"type",nav:"minimal",gallery:"editorial",menu:"ledger",reviews:"minimal",reserve:"split",frame:"editorial",motif:"none",motion:"reveal"}),
  experiential_escape:s({hero:"stage",nav:"utility",gallery:"masonry",menu:"cards",reviews:"marquee",reserve:"dock",frame:"layered",motif:"grid",motion:"snap"}),
  creative_workshop:s({hero:"mosaic",nav:"floating",gallery:"polaroid",menu:"cards",reviews:"cards",reserve:"band",frame:"layered",motif:"dots",motion:"float"}),
  chef_counter:s({hero:"type",nav:"centered",gallery:"stack",menu:"ledger",reviews:"editorial",reserve:"split",frame:"inset",motif:"lines",motion:"reveal"}),
  brunch_social:s({hero:"mosaic",nav:"floating",gallery:"mosaic",menu:"cards",reviews:"marquee",reserve:"band",frame:"boxed",motif:"rings",motion:"drift"}),
  fast_casual_polished:s({hero:"split",nav:"utility",gallery:"grid",menu:"board",reviews:"cards",reserve:"panel",frame:"edge",motif:"grid",motion:"reveal"}),
  social_games:s({hero:"stage",nav:"utility",gallery:"filmstrip",menu:"board",reviews:"marquee",reserve:"dock",frame:"edge",motif:"glow",motion:"snap"}),
  family_entertainment:s({hero:"mosaic",nav:"boxed",gallery:"polaroid",menu:"cards",reviews:"cards",reserve:"band",frame:"layered",motif:"dots",motion:"float"}),
  wellness_retreat:s({hero:"story",nav:"minimal",gallery:"stack",menu:"columns",reviews:"minimal",reserve:"split",frame:"inset",motif:"arches",motion:"drift"}),
  arts_culture:s({hero:"editorial",nav:"rail",gallery:"masonry",menu:"ledger",reviews:"editorial",reserve:"panel",frame:"editorial",motif:"lines",motion:"reveal"}),
  cinematic_entertainment:s({hero:"cinema",nav:"overlay",gallery:"panorama",menu:"compact",reviews:"marquee",reserve:"dock",frame:"edge",motif:"ticket",motion:"parallax"}),
  modern_steakhouse:s({hero:"stack",nav:"overlay",gallery:"editorial",menu:"split",reviews:"sidebar",reserve:"dock",frame:"inset",motif:"lines",motion:"parallax"}),
  sushi_modern:s({hero:"type",nav:"rail",gallery:"stack",menu:"ledger",reviews:"minimal",reserve:"split",frame:"editorial",motif:"grid",motion:"reveal"}),
  tropical_caribbean:s({hero:"mosaic",nav:"floating",gallery:"polaroid",menu:"cards",reviews:"marquee",reserve:"band",frame:"edge",motif:"wave",motion:"float"}),
  latin_night:s({hero:"cinema",nav:"overlay",gallery:"mosaic",menu:"cards",reviews:"marquee",reserve:"dock",frame:"layered",motif:"glow",motion:"parallax"}),
  rooftop_city:s({hero:"panorama",nav:"overlay",gallery:"filmstrip",menu:"split",reviews:"sidebar",reserve:"dock",frame:"edge",motif:"lines",motion:"drift"}),
  garden_terrace:s({hero:"story",nav:"floating",gallery:"masonry",menu:"columns",reviews:"cards",reserve:"band",frame:"inset",motif:"arches",motion:"drift"}),
  wine_cellar:s({hero:"story",nav:"centered",gallery:"stack",menu:"ledger",reviews:"editorial",reserve:"split",frame:"editorial",motif:"stamp",motion:"reveal"}),
  craft_brewery:s({hero:"split",nav:"utility",gallery:"filmstrip",menu:"board",reviews:"cards",reserve:"band",frame:"boxed",motif:"stamp",motion:"marquee"}),
  sports_watch:s({hero:"stage",nav:"utility",gallery:"mosaic",menu:"board",reviews:"marquee",reserve:"dock",frame:"edge",motif:"grid",motion:"snap"}),
  jazz_room:s({hero:"stack",nav:"minimal",gallery:"editorial",menu:"ledger",reviews:"sidebar",reserve:"split",frame:"inset",motif:"rings",motion:"parallax"}),
  comedy_club:s({hero:"poster",nav:"utility",gallery:"filmstrip",menu:"compact",reviews:"marquee",reserve:"dock",frame:"boxed",motif:"ticket",motion:"marquee"}),
  karaoke_social:s({hero:"poster",nav:"floating",gallery:"mosaic",menu:"cards",reviews:"marquee",reserve:"dock",frame:"layered",motif:"glow",motion:"float"}),
  arcade_neon:s({hero:"stage",nav:"rail",gallery:"masonry",menu:"board",reviews:"marquee",reserve:"dock",frame:"edge",motif:"glow",motion:"snap"}),
  bowling_luxe:s({hero:"cinema",nav:"boxed",gallery:"filmstrip",menu:"cards",reviews:"sidebar",reserve:"dock",frame:"layered",motif:"rings",motion:"parallax"}),
  escape_cinematic:s({hero:"poster",nav:"overlay",gallery:"masonry",menu:"compact",reviews:"editorial",reserve:"stage",frame:"edge",motif:"ticket",motion:"snap"}),
  mini_golf_playful:s({hero:"mosaic",nav:"utility",gallery:"polaroid",menu:"cards",reviews:"cards",reserve:"band",frame:"layered",motif:"rings",motion:"float"}),
  museum_modern:s({hero:"editorial",nav:"rail",gallery:"masonry",menu:"columns",reviews:"editorial",reserve:"panel",frame:"editorial",motif:"grid",motion:"reveal"}),
  theater_grand:s({hero:"poster",nav:"centered",gallery:"panorama",menu:"ledger",reviews:"editorial",reserve:"stage",frame:"inset",motif:"arches",motion:"parallax"}),
  spa_serene:s({hero:"story",nav:"minimal",gallery:"stack",menu:"columns",reviews:"minimal",reserve:"split",frame:"inset",motif:"wave",motion:"drift"}),
  dessert_bakery:s({hero:"mosaic",nav:"floating",gallery:"polaroid",menu:"cards",reviews:"cards",reserve:"band",frame:"boxed",motif:"dots",motion:"float"}),
  coffee_roastery:s({hero:"split",nav:"centered",gallery:"filmstrip",menu:"ledger",reviews:"sidebar",reserve:"panel",frame:"boxed",motif:"stamp",motion:"marquee"}),
  private_events:s({hero:"stage",nav:"boxed",gallery:"editorial",menu:"columns",reviews:"cards",reserve:"stage",frame:"layered",motif:"arches",motion:"reveal"}),
};

const baseStyles = `
/* Agency template architecture. Structural variation, not a palette skin. */
.agency-v2{--agency-gutter:clamp(20px,4vw,72px);--agency-section:clamp(88px,11vw,180px);--agency-ease:cubic-bezier(.2,.75,.2,1)}
.agency-v2 main{overflow:clip}.agency-v2 .site-nav{transition:transform .35s var(--agency-ease),background .35s ease,border-color .35s ease}.agency-v2 .hero{isolation:isolate}.agency-v2 .hero-copy,.agency-v2 .hero-media,.agency-v2 .toh-rich-section,.agency-v2 .content-section{transition:opacity .7s var(--agency-ease),transform .8s var(--agency-ease)}
.agency-v2 .agency-reveal{opacity:0;transform:translateY(26px)}.agency-v2 .agency-reveal.is-visible{opacity:1;transform:none}

/* Navigation systems */
.agency-nav-overlay .site-nav{position:absolute;top:0;left:0;right:0;width:100%;margin:0!important;border:0!important;border-radius:0!important;background:linear-gradient(180deg,rgba(0,0,0,.48),transparent)!important;color:#fff;padding:26px var(--agency-gutter)!important}
.agency-nav-rail{padding-left:92px}.agency-nav-rail .site-nav{position:fixed!important;left:0;top:0;bottom:0;width:92px;height:100vh;flex-direction:column;justify-content:space-between;padding:28px 14px!important;border:0!important;border-right:1px solid var(--border)!important;border-radius:0!important}.agency-nav-rail .brand{writing-mode:vertical-rl;transform:rotate(180deg);max-width:none}.agency-nav-rail .nav-actions{flex-direction:column}.agency-nav-rail .nav-link:not(.reserve){display:none}
.agency-nav-centered .site-nav{display:grid!important;grid-template-columns:1fr auto 1fr}.agency-nav-centered .brand{text-align:center;grid-column:2}.agency-nav-centered .nav-actions{grid-column:3;justify-self:end}
.agency-nav-utility .site-nav{border-radius:0!important;width:100%!important;margin:0!important;padding:12px var(--agency-gutter)!important;min-height:58px!important}.agency-nav-utility .brand{font-size:12px;text-transform:uppercase;letter-spacing:.16em}
.agency-nav-boxed .site-nav{width:min(1180px,calc(100% - 32px))!important;margin:16px auto 0!important;border-radius:14px!important}.agency-nav-minimal .site-nav{background:transparent!important;border:0!important;box-shadow:none!important}.agency-nav-floating .site-nav{width:min(1280px,calc(100% - 28px))!important;margin:12px auto 0!important;border-radius:999px!important;box-shadow:0 18px 70px rgba(0,0,0,.1)}

/* Hero systems */
.agency-hero-cinema .hero{width:100%!important;max-width:none!important;min-height:92vh!important;padding:clamp(140px,18vh,220px) var(--agency-gutter) 80px!important;display:flex!important;align-items:flex-end!important}.agency-hero-cinema .hero-media{position:absolute!important;inset:0!important;border-radius:0!important;z-index:-2}.agency-hero-cinema .hero-media img{height:100%!important;object-fit:cover}.agency-hero-cinema .hero:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.78),rgba(0,0,0,.24) 58%,rgba(0,0,0,.08));z-index:-1}.agency-hero-cinema .hero-copy{max-width:min(760px,72vw);color:#fff}.agency-hero-cinema .hero h1{font-size:clamp(4.2rem,10vw,10rem)!important}.agency-hero-cinema .hero-deck{color:rgba(255,255,255,.82)!important}
.agency-hero-editorial .hero{grid-template-columns:minmax(0,.82fr) minmax(420px,1.18fr)!important;align-items:end!important}.agency-hero-editorial .hero-copy{padding-bottom:12vh}.agency-hero-editorial .hero h1{font-size:clamp(5rem,10.5vw,11rem)!important;line-height:.82!important}.agency-hero-editorial .hero-media{margin-top:8vh;aspect-ratio:4/5!important}.agency-hero-editorial .hero-media:before{content:"";position:absolute;left:-28px;top:-28px;width:38%;height:38%;border-left:1px solid var(--accent);border-top:1px solid var(--accent)}
.agency-hero-mosaic .hero{grid-template-columns:.7fr 1.3fr!important;min-height:820px!important}.agency-hero-mosaic .hero-media{grid-column:2;aspect-ratio:1/1!important;clip-path:polygon(6% 0,100% 0,100% 88%,82% 100%,0 100%,0 10%)}.agency-hero-mosaic .agency-hero-collage{position:absolute;right:0;top:8%;width:55%;height:78%;z-index:-1}.agency-hero-mosaic .agency-hero-collage img{position:absolute;object-fit:cover;border:8px solid var(--bg);box-shadow:0 24px 80px rgba(0,0,0,.18)}.agency-hero-mosaic .agency-hero-collage img:nth-child(1){width:54%;height:48%;right:0;top:0}.agency-hero-mosaic .agency-hero-collage img:nth-child(2){width:46%;height:44%;left:0;top:26%}.agency-hero-mosaic .agency-hero-collage img:nth-child(3){width:50%;height:40%;right:8%;bottom:0}.agency-hero-mosaic .hero-media{opacity:.22}
.agency-hero-poster .hero{width:100%!important;max-width:none!important;min-height:88vh!important;padding:120px var(--agency-gutter)!important;display:grid!important;place-items:center;text-align:center}.agency-hero-poster .hero-copy{max-width:1100px;z-index:3}.agency-hero-poster .hero h1{text-transform:uppercase;font-size:clamp(5rem,13vw,14rem)!important;line-height:.76!important;letter-spacing:-.075em!important}.agency-hero-poster .hero-media{position:absolute!important;inset:12% 18%!important;z-index:-1;opacity:.55;transform:rotate(-2deg);aspect-ratio:auto!important}.agency-hero-poster .hero-media img{height:100%;object-fit:cover}.agency-hero-poster .hero-actions{justify-content:center}.agency-hero-poster .eyebrow{display:inline-block;border:1px solid currentColor;padding:9px 14px;border-radius:999px}
.agency-hero-split .hero{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:0!important;width:min(1500px,calc(100% - 40px))!important}.agency-hero-split .hero-copy{padding:clamp(40px,6vw,96px);background:var(--surface);align-self:stretch;display:flex;flex-direction:column;justify-content:center}.agency-hero-split .hero-media{align-self:stretch;border-radius:0!important;min-height:680px}.agency-hero-split .hero-media img{height:100%;object-fit:cover}
.agency-hero-stack .hero{display:block!important;min-height:900px!important;padding-top:130px!important}.agency-hero-stack .hero-copy{width:min(850px,72%);position:relative;z-index:3}.agency-hero-stack .hero h1{font-size:clamp(5rem,11vw,11rem)!important}.agency-hero-stack .hero-media{width:68%;height:620px;margin:-70px 0 0 auto;transform:translateX(4%);border-radius:0!important}.agency-hero-stack .hero-media img{height:100%;object-fit:cover}.agency-hero-stack .hero-reserve-prompt{left:7%;right:auto!important;bottom:9%;max-width:340px}
.agency-hero-stage .hero{width:100%!important;max-width:none!important;padding-left:var(--agency-gutter)!important;padding-right:var(--agency-gutter)!important;grid-template-columns:1.05fr .95fr!important;background:linear-gradient(135deg,var(--surface2),var(--bg))}.agency-hero-stage .hero-copy{border-left:6px solid var(--accent);padding-left:clamp(24px,4vw,64px)}.agency-hero-stage .hero-media{transform:perspective(1200px) rotateY(-6deg) rotateX(2deg);box-shadow:30px 40px 100px rgba(0,0,0,.22)!important}.agency-hero-stage .hero-reserve-prompt{border-radius:0!important}
.agency-hero-story .hero{grid-template-columns:.78fr 1.22fr!important;min-height:900px!important}.agency-hero-story .hero-copy{align-self:start;padding-top:12vh}.agency-hero-story .hero-media{height:720px;align-self:end;border-radius:999px 999px 22px 22px!important;overflow:hidden}.agency-hero-story .hero-media img{height:100%;object-fit:cover}.agency-hero-story .hero h1{font-size:clamp(4.5rem,8vw,8rem)!important}
.agency-hero-panorama .hero{display:block!important;width:100%!important;max-width:none!important;padding:0 0 70px!important}.agency-hero-panorama .hero-media{height:min(72vh,760px);border-radius:0!important}.agency-hero-panorama .hero-media img{height:100%;object-fit:cover}.agency-hero-panorama .hero-copy{width:min(var(--max),calc(100% - 48px));margin:-90px auto 0;position:relative;background:var(--bg);padding:clamp(32px,5vw,70px);box-shadow:0 -30px 80px rgba(0,0,0,.08)}.agency-hero-panorama .hero h1{font-size:clamp(4rem,8.5vw,9rem)!important}
.agency-hero-type .hero{display:grid!important;grid-template-columns:1fr!important;min-height:88vh!important;align-content:center}.agency-hero-type .hero-copy{width:100%;max-width:none!important}.agency-hero-type .hero h1{font-size:clamp(6rem,15vw,15rem)!important;line-height:.72!important;letter-spacing:-.085em!important}.agency-hero-type .hero-media{width:min(520px,44vw);position:absolute!important;right:2%;bottom:4%;z-index:-1;opacity:.82;aspect-ratio:3/4!important}.agency-hero-type .hero-deck{max-width:520px;margin-left:auto}

/* Page frames */
.agency-frame-boxed main{width:min(1480px,calc(100% - 32px));margin:20px auto 40px;border:1px solid var(--border);background:var(--bg);box-shadow:0 34px 120px rgba(0,0,0,.08)}.agency-frame-inset main{width:calc(100% - clamp(20px,4vw,80px));margin:0 auto}.agency-frame-editorial main{border-left:1px solid var(--border);border-right:1px solid var(--border);width:min(1540px,calc(100% - 64px));margin:auto}.agency-frame-layered main{background:linear-gradient(180deg,var(--bg),color-mix(in srgb,var(--surface2) 48%,var(--bg)) 48%,var(--bg))}

/* Gallery systems */
.agency-gallery-filmstrip .toh-gallery-grid{display:flex!important;overflow-x:auto;padding-bottom:24px;scroll-snap-type:x mandatory;gap:18px!important}.agency-gallery-filmstrip .toh-gallery-grid figure{flex:0 0 min(68vw,760px);height:520px;scroll-snap-align:center}.agency-gallery-filmstrip .toh-gallery-grid figure:nth-child(even){flex-basis:min(38vw,430px);margin-top:80px}.agency-gallery-filmstrip .toh-gallery-grid img{height:100%!important;aspect-ratio:auto!important}
.agency-gallery-masonry .toh-gallery-grid{display:block!important;columns:3 280px;column-gap:18px}.agency-gallery-masonry .toh-gallery-grid figure{break-inside:avoid;margin:0 0 18px!important}.agency-gallery-masonry .toh-gallery-grid img{height:auto!important;min-height:0!important;aspect-ratio:auto!important}.agency-gallery-masonry .toh-gallery-grid figure:nth-child(3n+1) img{aspect-ratio:3/4;object-fit:cover}.agency-gallery-masonry .toh-gallery-grid figure:nth-child(3n+2) img{aspect-ratio:4/3;object-fit:cover}
.agency-gallery-editorial .toh-gallery-grid{grid-template-columns:repeat(12,1fr)!important;align-items:start}.agency-gallery-editorial .toh-gallery-grid figure:nth-child(1){grid-column:1/span 7!important}.agency-gallery-editorial .toh-gallery-grid figure:nth-child(2){grid-column:9/span 4!important;margin-top:130px}.agency-gallery-editorial .toh-gallery-grid figure:nth-child(3){grid-column:2/span 4!important;margin-top:40px}.agency-gallery-editorial .toh-gallery-grid figure:nth-child(4){grid-column:7/span 6!important;margin-top:-40px}.agency-gallery-editorial .toh-gallery-grid figure:nth-child(n+5){grid-column:span 6!important}
.agency-gallery-panorama .toh-gallery-grid figure:first-child{grid-column:1/-1!important;height:620px}.agency-gallery-panorama .toh-gallery-grid figure:first-child img{height:100%;object-fit:cover}.agency-gallery-panorama .toh-gallery-grid figure:nth-child(n+2){grid-column:span 3!important}
.agency-gallery-polaroid .toh-gallery-grid{grid-template-columns:repeat(3,1fr)!important;gap:clamp(18px,3vw,42px)!important;padding:30px}.agency-gallery-polaroid .toh-gallery-grid figure{grid-column:auto!important;background:#fff!important;padding:10px 10px 42px!important;border-radius:2px!important;box-shadow:0 22px 60px rgba(0,0,0,.16)!important}.agency-gallery-polaroid .toh-gallery-grid figure:nth-child(odd){transform:rotate(-2deg)}.agency-gallery-polaroid .toh-gallery-grid figure:nth-child(even){transform:rotate(2deg) translateY(30px)}
.agency-gallery-stack .toh-gallery-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8vw!important}.agency-gallery-stack .toh-gallery-grid figure{grid-column:auto!important;border-radius:0!important}.agency-gallery-stack .toh-gallery-grid figure:nth-child(even){margin-top:160px}.agency-gallery-stack .toh-gallery-grid figure:nth-child(3n){transform:translateX(12%)}
.agency-gallery-grid .toh-gallery-grid{grid-template-columns:repeat(2,1fr)!important}.agency-gallery-grid .toh-gallery-grid figure{grid-column:auto!important;border-radius:0!important}.agency-gallery-mosaic .toh-gallery-grid figure:nth-child(1){grid-column:span 8!important;grid-row:span 2}.agency-gallery-mosaic .toh-gallery-grid figure:nth-child(2){grid-column:span 4!important}.agency-gallery-mosaic .toh-gallery-grid figure:nth-child(3){grid-column:span 4!important}.agency-gallery-mosaic .toh-gallery-grid figure:nth-child(n+4){grid-column:span 6!important}

/* Menu systems */
.agency-menu-ledger .toh-menu-grid{display:block!important;max-width:1040px;margin-left:auto}.agency-menu-ledger .toh-menu-item{border-width:0 0 1px!important;border-radius:0!important;background:transparent!important;padding:25px 0!important;box-shadow:none!important}.agency-menu-ledger .toh-menu-item h3{font-family:var(--display);font-size:clamp(22px,2.2vw,32px)!important;font-weight:500}.agency-menu-ledger .toh-menu-section{margin-top:52px!important;font-size:13px!important}
.agency-menu-cards .toh-menu-grid{grid-template-columns:repeat(3,1fr)!important;gap:18px!important}.agency-menu-cards .toh-menu-item{display:block!important;min-height:190px;padding:28px!important}.agency-menu-cards .toh-menu-item strong{display:block;margin-top:28px}.agency-menu-columns .toh-menu-grid{grid-template-columns:repeat(2,1fr)!important;column-gap:6vw!important}.agency-menu-columns .toh-menu-item{border:0!important;border-radius:0!important;border-bottom:1px solid var(--border)!important;background:transparent!important;padding:20px 0!important}.agency-menu-board .toh-menu-grid{background:var(--text);color:var(--bg);padding:clamp(24px,4vw,60px);grid-template-columns:repeat(2,1fr)!important}.agency-menu-board .toh-menu-item{background:transparent!important;color:inherit!important;border-color:color-mix(in srgb,var(--bg) 20%,transparent)!important}.agency-menu-board .toh-menu-item p{color:color-mix(in srgb,var(--bg) 66%,transparent)!important}.agency-menu-split .toh-menu-grid{grid-template-columns:1fr 1fr!important;gap:0!important}.agency-menu-split .toh-menu-item{border-radius:0!important;border-width:0 0 1px!important;background:transparent!important;padding:26px!important}.agency-menu-compact .toh-menu-grid{grid-template-columns:repeat(4,1fr)!important}.agency-menu-compact .toh-menu-item{display:block!important;padding:18px!important}.agency-menu-compact .toh-menu-item p{display:none}

/* Reviews */
.agency-review-marquee .toh-reviews-grid{display:flex!important;overflow:hidden;gap:18px!important}.agency-review-marquee .toh-review{flex:0 0 min(520px,76vw);min-height:300px}.agency-review-marquee .toh-review:nth-child(even){transform:translateY(34px)}.agency-review-editorial .toh-reviews-grid{grid-template-columns:2fr 1fr 1fr!important}.agency-review-editorial .toh-review:first-child{grid-row:span 2;display:flex;flex-direction:column;justify-content:center}.agency-review-editorial .toh-review:first-child blockquote{font-size:clamp(34px,4vw,58px)!important}.agency-review-sidebar .toh-rich-section:has(.toh-reviews-grid){display:grid;grid-template-columns:.55fr 1.45fr;gap:6vw}.agency-review-sidebar .toh-reviews-grid{grid-template-columns:1fr!important}.agency-review-minimal .toh-reviews-grid{display:block!important;max-width:960px;margin:auto}.agency-review-minimal .toh-review{border:0!important;background:transparent!important;text-align:center;box-shadow:none!important}.agency-review-minimal .toh-review:not(:first-child){display:none}.agency-review-minimal .toh-review blockquote{font-size:clamp(32px,5vw,64px)!important}

/* Reservation systems */
.agency-reserve-band .reservation-section{padding:0!important}.agency-reserve-band .reservation-shell{width:100%!important;max-width:none!important;grid-template-columns:.7fr 1.3fr!important;padding:clamp(42px,6vw,90px) var(--agency-gutter);background:var(--accent);color:var(--accentText)}.agency-reserve-band .reservation-intro p{color:color-mix(in srgb,var(--accentText) 76%,transparent)!important}.agency-reserve-split .reservation-shell{grid-template-columns:1fr 1fr!important;gap:0!important}.agency-reserve-split .reservation-intro{padding:clamp(40px,6vw,90px);background:var(--text);color:var(--bg)}.agency-reserve-split .reservation-frame-shell{border-radius:0!important}.agency-reserve-dock .reservation-section{padding:0 var(--agency-gutter) var(--agency-section)!important}.agency-reserve-dock .reservation-shell{display:block!important;position:relative}.agency-reserve-dock .reservation-intro{width:min(620px,70%);position:relative;z-index:2;padding:42px;background:var(--surface);box-shadow:0 28px 80px rgba(0,0,0,.16);transform:translate(24px,64px)}.agency-reserve-dock .reservation-frame-shell{margin-left:22%;min-height:620px}.agency-reserve-panel .reservation-shell{width:min(1180px,calc(100% - 48px))!important;padding:clamp(28px,4vw,58px);background:var(--surface);border:1px solid var(--border);box-shadow:0 34px 110px rgba(0,0,0,.1)}.agency-reserve-stage .reservation-section{background:var(--text)!important;color:var(--bg);padding:var(--agency-section) var(--agency-gutter)!important}.agency-reserve-stage .reservation-shell{grid-template-columns:.55fr 1.45fr!important}.agency-reserve-stage .reservation-intro{position:sticky;top:140px;align-self:start}

/* Motifs */
.agency-motif-lines main:before,.agency-motif-grid main:before,.agency-motif-glow main:before,.agency-motif-rings main:before,.agency-motif-dots main:before,.agency-motif-wave main:before{content:"";position:fixed;inset:0;pointer-events:none;z-index:-1}.agency-motif-lines main:before{background:repeating-linear-gradient(90deg,transparent 0,transparent calc(25% - 1px),color-mix(in srgb,var(--border) 45%,transparent) 25%)}.agency-motif-grid main:before{background-image:linear-gradient(color-mix(in srgb,var(--border) 25%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--border) 25%,transparent) 1px,transparent 1px);background-size:54px 54px;mask-image:linear-gradient(to bottom,black,transparent 70%)}.agency-motif-glow main:before{background:radial-gradient(circle at 78% 18%,color-mix(in srgb,var(--accent) 22%,transparent),transparent 32%),radial-gradient(circle at 12% 68%,color-mix(in srgb,var(--accent) 12%,transparent),transparent 30%)}.agency-motif-rings main:before{background:radial-gradient(circle at 85% 20%,transparent 0 10%,color-mix(in srgb,var(--accent) 20%,transparent) 10.2% 10.5%,transparent 10.7% 18%,color-mix(in srgb,var(--accent) 12%,transparent) 18.2% 18.5%,transparent 18.7%)}.agency-motif-dots main:before{background-image:radial-gradient(color-mix(in srgb,var(--accent) 20%,transparent) 1px,transparent 1px);background-size:26px 26px;mask-image:linear-gradient(120deg,black,transparent 60%)}.agency-motif-wave main:before{background:radial-gradient(ellipse at 0 25%,transparent 0 50%,color-mix(in srgb,var(--accent) 12%,transparent) 50.3% 50.8%,transparent 51%)}
.agency-motif-ticket .hero:after{content:"ADMIT ONE";position:absolute;right:var(--agency-gutter);top:20%;padding:10px 18px;border:1px dashed currentColor;letter-spacing:.22em;font-size:10px;transform:rotate(90deg);transform-origin:right top;opacity:.6}.agency-motif-stamp .hero:after{content:"EST. • LOCAL •";position:absolute;right:4%;top:16%;display:grid;place-items:center;width:110px;height:110px;border:1px solid var(--accent);border-radius:50%;color:var(--accent);font-size:9px;letter-spacing:.14em;transform:rotate(12deg)}.agency-motif-arches .hero:after{content:"";position:absolute;right:-7%;bottom:-8%;width:34vw;height:34vw;border:1px solid color-mix(in srgb,var(--accent) 32%,transparent);border-radius:50% 50% 0 0;z-index:-1}

/* Motion personalities */
.agency-motion-drift .hero-media{animation:agencyDrift 10s ease-in-out infinite alternate}.agency-motion-float .toh-gallery-grid figure:nth-child(odd){animation:agencyFloat 7s ease-in-out infinite alternate}.agency-motion-marquee .toh-rich-head h2:after{content:"  •  ${"THEOUT"}";opacity:.12;white-space:nowrap}.agency-motion-snap .toh-rich-section{scroll-margin-top:40px}.agency-motion-parallax .hero-media img{transform:scale(1.05)}@keyframes agencyDrift{to{transform:translateY(-14px)}}@keyframes agencyFloat{to{transform:translateY(-12px) rotate(.4deg)}}

@media(max-width:900px){.agency-nav-rail{padding-left:0}.agency-nav-rail .site-nav{position:sticky!important;width:calc(100% - 20px);height:auto;flex-direction:row;margin:8px auto!important;border:1px solid var(--border)!important;border-radius:999px!important}.agency-nav-rail .brand{writing-mode:horizontal-tb;transform:none}.agency-nav-rail .nav-actions{flex-direction:row}.agency-hero-cinema .hero,.agency-hero-poster .hero{min-height:760px!important}.agency-hero-editorial .hero,.agency-hero-mosaic .hero,.agency-hero-split .hero,.agency-hero-stage .hero,.agency-hero-story .hero{grid-template-columns:1fr!important}.agency-hero-editorial .hero-copy,.agency-hero-story .hero-copy{padding-bottom:0}.agency-hero-mosaic .agency-hero-collage{position:relative;width:100%;height:500px;grid-row:2}.agency-hero-stack .hero-copy{width:100%}.agency-hero-stack .hero-media{width:90%;height:520px;margin:20px auto 0}.agency-menu-cards .toh-menu-grid,.agency-menu-compact .toh-menu-grid{grid-template-columns:1fr 1fr!important}.agency-review-sidebar .toh-rich-section:has(.toh-reviews-grid){display:block}.agency-reserve-dock .reservation-intro{width:auto;transform:none}.agency-reserve-dock .reservation-frame-shell{margin-left:0}.agency-reserve-stage .reservation-shell{grid-template-columns:1fr!important}}
@media(max-width:640px){.agency-v2{--agency-section:78px}.agency-frame-boxed main,.agency-frame-editorial main,.agency-frame-inset main{width:100%;margin:0;border-left:0;border-right:0}.agency-hero-cinema .hero,.agency-hero-poster .hero{padding-left:20px!important;padding-right:20px!important}.agency-hero-poster .hero-media{inset:18% 4%!important}.agency-hero-type .hero h1{font-size:clamp(4.4rem,21vw,8rem)!important}.agency-gallery-polaroid .toh-gallery-grid,.agency-gallery-stack .toh-gallery-grid,.agency-gallery-grid .toh-gallery-grid{grid-template-columns:1fr!important}.agency-gallery-polaroid .toh-gallery-grid figure:nth-child(even),.agency-gallery-stack .toh-gallery-grid figure:nth-child(even){margin-top:0}.agency-menu-cards .toh-menu-grid,.agency-menu-columns .toh-menu-grid,.agency-menu-board .toh-menu-grid,.agency-menu-split .toh-menu-grid,.agency-menu-compact .toh-menu-grid{grid-template-columns:1fr!important}.agency-review-editorial .toh-reviews-grid{grid-template-columns:1fr!important}.agency-reserve-band .reservation-shell,.agency-reserve-split .reservation-shell{grid-template-columns:1fr!important}.agency-motif-stamp .hero:after,.agency-motif-ticket .hero:after{display:none}}
@media(prefers-reduced-motion:reduce){.agency-v2 *{animation:none!important;scroll-behavior:auto!important;transition:none!important}.agency-v2 .agency-reveal{opacity:1!important;transform:none!important}}
`;

export function getAgencyTemplateSignature(directionId: string) {
  return AGENCY_TEMPLATE_SIGNATURES[directionId] || AGENCY_TEMPLATE_SIGNATURES.modern_minimal;
}

export function agencyTemplateStyles() {
  return baseStyles;
}

export function applyAgencyTemplateSystem(html: string, website: BusinessWebsite) {
  const directionId = String(website.theme?.design_direction_id || "modern_minimal");
  const signature = getAgencyTemplateSignature(directionId);
  const classes = [
    "agency-v2",
    `agency-hero-${signature.hero}`,
    `agency-nav-${signature.nav}`,
    `agency-gallery-${signature.gallery}`,
    `agency-menu-${signature.menu}`,
    `agency-review-${signature.reviews}`,
    `agency-reserve-${signature.reserve}`,
    `agency-frame-${signature.frame}`,
    `agency-motif-${signature.motif}`,
    `agency-motion-${signature.motion}`,
  ].join(" ");
  return html.replace(/<body class="([^"]*)">/, `<body class="$1 ${classes}" data-agency-template="${directionId}">`);
}

export function agencyTemplateScript() {
  return `<script>(function(){
    var b=document.body;if(!b||!b.classList.contains('agency-v2'))return;
    var hero=document.querySelector('.hero');var gallery=[].slice.call(document.querySelectorAll('.toh-gallery-grid img'));
    if(hero&&gallery.length&&b.classList.contains('agency-hero-mosaic')){var c=document.createElement('div');c.className='agency-hero-collage';gallery.slice(0,3).forEach(function(img){var x=img.cloneNode(true);x.removeAttribute('loading');c.appendChild(x)});hero.appendChild(c)}
    var reveal=[].slice.call(document.querySelectorAll('.toh-rich-section,.content-section,.reservation-section'));
    if('IntersectionObserver' in window&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){reveal.forEach(function(el){el.classList.add('agency-reveal')});var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target)}})},{threshold:.08});reveal.forEach(function(el){io.observe(el)})}
    if(b.classList.contains('agency-motion-parallax')&&hero&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){var media=hero.querySelector('.hero-media');window.addEventListener('scroll',function(){if(!media)return;var y=Math.min(60,window.scrollY*.06);media.style.setProperty('--agency-parallax',y+'px');media.style.transform='translateY('+y+'px)'},{passive:true})}
  })();</script>`;
}
