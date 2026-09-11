import "server-only";

/**
 * Premium visual layer for every generated hosted website.
 *
 * This builds on the existing renderer and composition-* body classes so the
 * entire catalog benefits without introducing a second theme store or render path.
 */
export function premiumWebsiteStyles() {
  return `
:root{
  --toh-section-y:clamp(88px,10vw,164px);
  --toh-card-pad:clamp(24px,3vw,38px);
  --toh-hairline:color-mix(in srgb,var(--border) 72%,transparent);
  --toh-shadow-soft:0 24px 80px rgba(0,0,0,.10);
  --toh-shadow-deep:0 34px 110px rgba(0,0,0,.24);
  --toh-shadow-float:0 18px 60px rgba(0,0,0,.13);
}
html{background:var(--bg)}
body{font-feature-settings:"kern" 1,"liga" 1;text-rendering:optimizeLegibility;background:
  radial-gradient(circle at 86% 8%,color-mix(in srgb,var(--accent) 7%,transparent),transparent 34%),
  radial-gradient(circle at 8% 42%,color-mix(in srgb,var(--surface2) 58%,transparent),transparent 35%),
  var(--bg)}
main{isolation:isolate}
.site-nav{top:14px;width:min(calc(var(--max) + 48px),calc(100% - 32px));min-height:72px;margin:14px auto 0;padding:14px 16px 14px 22px!important;border:1px solid color-mix(in srgb,var(--border) 72%,transparent)!important;border-radius:999px;background:color-mix(in srgb,var(--surface) 84%,transparent)!important;backdrop-filter:blur(24px) saturate(1.18)!important;box-shadow:0 14px 50px rgba(0,0,0,.08)}
.brand{max-width:min(48vw,520px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:900;letter-spacing:-.01em}
.nav-actions{gap:8px}
.nav-link{border-color:color-mix(in srgb,var(--border) 78%,transparent);background:color-mix(in srgb,var(--surface) 54%,transparent)}
.nav-link,.button,.mobile-reserve{transition:transform .25s ease,background .25s ease,border-color .25s ease,box-shadow .25s ease}
.nav-link:hover,.button:hover{transform:translateY(-2px)}
.button.primary,.nav-link.reserve{box-shadow:0 10px 26px color-mix(in srgb,var(--accent) 18%,transparent)}
.button.primary:hover,.nav-link.reserve:hover{box-shadow:0 16px 40px color-mix(in srgb,var(--accent) 30%,transparent)}

/* Global hero upgrade: photography leads, copy feels editorial, not builder-generated. */
.hero{min-height:clamp(700px,78vh,900px)!important;padding-top:clamp(84px,8vw,128px)!important;padding-bottom:clamp(92px,9vw,148px)!important;gap:clamp(44px,6vw,96px)!important}
.hero-copy{max-width:680px}
.hero .eyebrow{margin-bottom:22px}
.hero h1{text-wrap:balance;letter-spacing:-.065em!important;line-height:.88!important}
.hero-deck{max-width:560px!important;font-size:clamp(1.02rem,1.45vw,1.24rem)!important;line-height:1.68!important;text-wrap:pretty}
.hero-actions{margin-top:36px!important;gap:12px!important}
.button{min-height:52px!important;padding:0 24px!important}
.button.ghost{background:color-mix(in srgb,var(--surface) 74%,transparent)!important;backdrop-filter:blur(12px)}
.hero-media{border:0!important;border-radius:clamp(22px,2.2vw,36px)!important;box-shadow:var(--toh-shadow-float);isolation:isolate}
.hero-media:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent 55%,rgba(0,0,0,.18));z-index:1}
.hero-media img,.toh-gallery-grid img,.toh-offering img,.gallery-stage img{transition:transform .8s cubic-bezier(.2,.75,.2,1),filter .4s ease;filter:saturate(1.06) contrast(1.025)}
.hero-media:hover img,.toh-gallery-grid figure:hover img,.toh-offering:hover img,.gallery-stage:hover img{transform:scale(1.035)}
.hero-media figcaption{z-index:2;left:20px!important;bottom:18px!important;padding:9px 12px!important;border:1px solid rgba(255,255,255,.18);background:rgba(15,15,15,.66)!important;color:#fff!important;backdrop-filter:blur(16px)!important}
.hero-split,.hero-framed,.hero-playful,.hero-reservation{grid-template-columns:minmax(0,.78fr) minmax(460px,1.22fr)!important}
.hero-editorial{grid-template-columns:minmax(0,.9fr) minmax(460px,1.1fr)!important}
.hero-experience{grid-template-columns:minmax(0,.68fr) minmax(520px,1.32fr)!important}
.hero-story{grid-template-columns:minmax(380px,.82fr) minmax(0,1.18fr)!important}
.hero-minimal .hero-media{width:min(980px,88%)!important;aspect-ratio:16/7!important}
.hero-reservation .hero-reserve-prompt{bottom:4px!important;box-shadow:0 18px 55px color-mix(in srgb,var(--accent) 24%,transparent)}

/* Full-site rhythm: alternate atmosphere and remove the plain white-page feeling. */
.content-section{position:relative;padding-top:var(--toh-section-y)!important;padding-bottom:var(--toh-section-y)!important}
.content-section:nth-of-type(even){box-shadow:0 0 0 100vmax color-mix(in srgb,var(--surface2) 48%,transparent);clip-path:inset(0 -100vmax)}
.section-label{padding-top:10px;text-transform:uppercase;letter-spacing:.12em}
.content-section h2,.reservation-intro h2{text-wrap:balance;letter-spacing:-.055em!important}
.lede{max-width:780px;text-wrap:pretty}
.quiet-link{margin-top:34px!important}
.detail-panel{border:1px solid color-mix(in srgb,var(--border) 72%,transparent)!important;background:linear-gradient(145deg,color-mix(in srgb,var(--surface) 96%,transparent),color-mix(in srgb,var(--surface2) 74%,transparent))!important;box-shadow:var(--toh-shadow-soft)}
.visit-grid{box-shadow:var(--toh-shadow-soft);border-color:color-mix(in srgb,var(--border) 76%,transparent)!important}
.visit-grid article{padding:clamp(28px,3.5vw,44px)!important}
.gallery-stage{border-radius:clamp(22px,2.2vw,36px)!important;box-shadow:var(--toh-shadow-deep)}
.gallery-caption{border:1px solid color-mix(in srgb,var(--border) 45%,transparent);border-radius:16px;backdrop-filter:blur(18px)!important}

/* Shared rich content styling used by menus, offerings, reviews and galleries. */
.toh-rich-section{padding:var(--toh-section-y) 0}
.toh-rich-section:nth-of-type(even){background:color-mix(in srgb,var(--surface2) 42%,transparent)}
.toh-rich-head{align-items:end;margin-bottom:clamp(38px,5vw,68px)}
.toh-rich-head h2{letter-spacing:-.055em;text-wrap:balance}
.toh-menu-item,.toh-review,.toh-offering,.toh-hours-panel,.reservation-frame-shell{transition:transform .25s ease,border-color .25s ease,box-shadow .25s ease}
.toh-menu-item:hover,.toh-review:hover,.toh-offering:hover{transform:translateY(-4px);border-color:color-mix(in srgb,var(--accent) 36%,var(--border));box-shadow:0 18px 50px rgba(0,0,0,.08)}
.toh-menu-item{padding:var(--toh-card-pad);background:color-mix(in srgb,var(--surface) 94%,transparent)}
.toh-menu-item h3{font-family:var(--display);font-size:clamp(20px,2vw,29px);font-weight:500;line-height:1.12;letter-spacing:-.025em}
.toh-menu-item p{font-size:14px;line-height:1.68}
.toh-menu-item strong{font-size:13px;letter-spacing:.04em}
.toh-menu-section{margin:38px 0 10px;padding-bottom:12px;border-bottom:1px solid var(--toh-hairline);font-weight:850}
.toh-review{padding:clamp(26px,3.2vw,42px);background:linear-gradient(145deg,var(--surface),color-mix(in srgb,var(--surface2) 66%,var(--surface)))}
.toh-review blockquote{font-size:clamp(21px,2.35vw,32px);letter-spacing:-.03em}
.toh-offering{overflow:hidden;box-shadow:0 18px 55px rgba(0,0,0,.08)}
.toh-offering img{height:clamp(240px,27vw,380px)}
.toh-offering-copy{padding:clamp(24px,3vw,36px)}
.toh-offering h3{font-family:var(--display);font-size:clamp(23px,2.35vw,36px);font-weight:500;letter-spacing:-.03em}
.toh-gallery-grid{gap:clamp(14px,2vw,24px)!important}
.toh-gallery-grid figure{overflow:hidden;box-shadow:0 18px 52px rgba(0,0,0,.09)}

/* Reservation should feel native to the website, not like a bolted-on widget. */
.reservation-section{background:linear-gradient(135deg,color-mix(in srgb,var(--surface) 96%,var(--accent)),var(--surface))!important;border-top:1px solid var(--toh-hairline);border-bottom:1px solid var(--toh-hairline)}
.reservation-frame-shell{border-color:color-mix(in srgb,var(--border) 70%,transparent)!important;box-shadow:0 34px 100px rgba(0,0,0,.12)!important}
.reservation-trust span{background:color-mix(in srgb,var(--surface2) 74%,transparent)}
.site-footer{border-top:1px solid var(--toh-hairline);padding-top:56px!important}
.footer-brand{letter-spacing:-.04em}

/* Fine-dining editorial: restrained rules, asymmetric imagery, printed-menu feel. */
.composition-editorial_luxury .site-nav,.composition-classic_bistro .site-nav{letter-spacing:.04em}
.composition-editorial_luxury .hero-media,.composition-classic_bistro .hero-media{box-shadow:18px 24px 0 var(--surface2),var(--toh-shadow-soft)}
.composition-editorial_luxury .toh-menu-grid,.composition-classic_bistro .toh-menu-grid{gap:0;border-top:1px solid var(--border)}
.composition-editorial_luxury .toh-menu-item,.composition-classic_bistro .toh-menu-item{border:0;border-bottom:1px solid var(--border);border-radius:0;background:transparent;padding-left:0;padding-right:0;box-shadow:none}
.composition-editorial_luxury .toh-menu-item:nth-of-type(odd),.composition-classic_bistro .toh-menu-item:nth-of-type(odd){padding-right:30px}
.composition-editorial_luxury .toh-menu-item:nth-of-type(even),.composition-classic_bistro .toh-menu-item:nth-of-type(even){padding-left:30px}
.composition-editorial_luxury .toh-gallery-grid figure:nth-child(1){grid-column:span 8;min-height:520px}
.composition-editorial_luxury .toh-gallery-grid figure:nth-child(2){grid-column:span 4;margin-top:100px}

/* After-dark / social: cinematic depth and image-led cards. */
.composition-refined_after_dark .hero-media,.composition-bold_social .hero-media,.composition-experiential_escape .hero-media{box-shadow:var(--toh-shadow-deep)}
.composition-refined_after_dark .toh-menu-item,.composition-bold_social .toh-menu-item,.composition-experiential_escape .toh-menu-item{background:linear-gradient(145deg,var(--surface),var(--surface2));border-color:color-mix(in srgb,var(--border) 72%,transparent)}
.composition-bold_social .toh-gallery-grid{gap:18px;transform:rotate(-.35deg)}
.composition-bold_social .toh-gallery-grid figure:nth-child(2){transform:translateY(50px)}
.composition-experiential_escape .toh-offering{box-shadow:0 24px 68px rgba(0,0,0,.2)}

/* Modern conversion-first: crisp surfaces and reservation hierarchy. */
.composition-modern_minimal .hero-media{box-shadow:0 30px 90px rgba(0,0,0,.12)}
.composition-modern_minimal .reservation-frame-shell{box-shadow:0 30px 90px rgba(0,0,0,.12)}
.composition-modern_minimal .toh-menu-item{box-shadow:0 12px 40px rgba(0,0,0,.045)}
.composition-modern_minimal .toh-hours-panel{box-shadow:0 18px 50px rgba(0,0,0,.055)}

/* Coastal / neighborhood: generous whitespace and tactile cards. */
.composition-coastal_airy .toh-gallery-grid{gap:20px}
.composition-coastal_airy .toh-gallery-grid figure{box-shadow:0 20px 55px rgba(25,55,60,.08)}
.composition-warm_neighborhood .toh-menu-item,.composition-creative_workshop .toh-menu-item{box-shadow:0 14px 40px rgba(57,32,18,.07)}
.composition-warm_neighborhood .toh-offering,.composition-creative_workshop .toh-offering{transform:rotate(-.15deg)}
.composition-warm_neighborhood .toh-offering:nth-child(even),.composition-creative_workshop .toh-offering:nth-child(even){transform:rotate(.3deg) translateY(10px)}

/* Quiet luxury: typography and negative space carry the design. */
.composition-luxury_minimal .hero{padding-top:clamp(110px,13vw,180px)!important;padding-bottom:clamp(120px,14vw,200px)!important}
.composition-luxury_minimal .toh-rich-section{padding:clamp(110px,13vw,190px) 0}
.composition-luxury_minimal .toh-menu-grid{grid-template-columns:1fr;max-width:860px;margin-left:auto}
.composition-luxury_minimal .toh-menu-item{border-width:0 0 1px;border-radius:0;background:transparent;padding:30px 0;box-shadow:none}
.composition-luxury_minimal .toh-rich-head{grid-template-columns:1fr;max-width:760px}
.composition-luxury_minimal .toh-gallery-grid figure{border-radius:0}

/* Theme inheritance for native booking shell and external-provider handoff. */
.reservation-native-shell>[data-theouthaven-reservations]{color:var(--text);font-family:var(--body)}
.reservation-native-shell>[data-theouthaven-reservations] button,
.reservation-native-shell>[data-theouthaven-reservations] [role="button"]{border-radius:var(--radius)!important;font-family:var(--body)!important}
.reservation-native-shell>[data-theouthaven-reservations] input,
.reservation-native-shell>[data-theouthaven-reservations] select{border-radius:var(--radius)!important;font-family:var(--body)!important}
.toh-external-reservation-card{box-shadow:var(--toh-shadow-soft)}
.toh-external-reservation-card .button{border-radius:var(--radius)}

@media(max-width:980px){
  .hero-split,.hero-framed,.hero-playful,.hero-reservation,.hero-editorial,.hero-experience,.hero-story{grid-template-columns:minmax(0,.9fr) minmax(360px,1.1fr)!important}
}
@media(max-width:820px){
  :root{--toh-section-y:76px;--toh-card-pad:22px}
  .site-nav{top:8px;width:calc(100% - 20px);min-height:62px;margin-top:8px;padding:10px 12px 10px 16px!important}
  .hero{min-height:auto!important;padding:72px 0 64px!important;grid-template-columns:1fr!important;gap:36px!important}
  .hero-copy{max-width:none}
  .hero h1{font-size:clamp(3.3rem,16vw,5.6rem)!important}
  .hero-media{width:100%!important;transform:none!important;aspect-ratio:4/3!important;border-radius:22px!important}
  .hero-minimal .hero-media{width:100%!important;aspect-ratio:4/3!important}
  .toh-rich-head{margin-bottom:30px}
  .composition-editorial_luxury .hero-media,.composition-classic_bistro .hero-media{box-shadow:10px 12px 0 var(--surface2),var(--toh-shadow-soft)}
  .composition-editorial_luxury .toh-menu-item:nth-of-type(odd),.composition-editorial_luxury .toh-menu-item:nth-of-type(even),.composition-classic_bistro .toh-menu-item:nth-of-type(odd),.composition-classic_bistro .toh-menu-item:nth-of-type(even){padding-left:0;padding-right:0}
  .composition-editorial_luxury .toh-gallery-grid figure:nth-child(1),.composition-editorial_luxury .toh-gallery-grid figure:nth-child(2){min-height:unset;margin-top:0}
  .composition-luxury_minimal .toh-rich-section{padding:88px 0}
  .toh-offering img{height:260px}
}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}.hero-media img,.toh-gallery-grid img,.toh-offering img,.gallery-stage img,.nav-link,.button,.toh-menu-item,.toh-review,.toh-offering{transition:none!important}}
`;
}
