import "server-only";

/**
 * Premium visual layer for generated hosted websites.
 *
 * This intentionally builds on the existing renderer and its composition-* body
 * classes. It does not introduce another theme store or another rendering path.
 */
export function premiumWebsiteStyles() {
  return `
:root{
  --toh-section-y:clamp(76px,9vw,142px);
  --toh-card-pad:clamp(22px,3vw,34px);
  --toh-hairline:color-mix(in srgb,var(--border) 76%,transparent);
  --toh-shadow-soft:0 24px 80px rgba(0,0,0,.10);
  --toh-shadow-deep:0 34px 110px rgba(0,0,0,.22);
}
body{font-feature-settings:"kern" 1,"liga" 1;text-rendering:optimizeLegibility}
.site-nav{min-height:76px}
.brand{max-width:min(48vw,520px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-link,.button,.mobile-reserve{transition:transform .25s ease,background .25s ease,border-color .25s ease,box-shadow .25s ease}
.nav-link:hover,.button:hover{transform:translateY(-2px)}
.button.primary:hover,.nav-link.reserve:hover{box-shadow:0 14px 34px color-mix(in srgb,var(--accent) 26%,transparent)}
.hero-media img,.toh-gallery-grid img,.toh-offering img{transition:transform .7s cubic-bezier(.2,.75,.2,1),filter .4s ease}
.hero-media:hover img,.toh-gallery-grid figure:hover img,.toh-offering:hover img{transform:scale(1.025)}
.toh-rich-section{padding:var(--toh-section-y) 0}
.toh-rich-head{align-items:end;margin-bottom:clamp(34px,5vw,62px)}
.toh-rich-head h2{letter-spacing:-.045em}
.toh-menu-item,.toh-review,.toh-offering,.toh-hours-panel,.reservation-frame-shell{transition:transform .25s ease,border-color .25s ease,box-shadow .25s ease}
.toh-menu-item:hover,.toh-review:hover,.toh-offering:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--accent) 32%,var(--border))}
.toh-menu-item{padding:var(--toh-card-pad)}
.toh-menu-item h3{font-family:var(--display);font-size:clamp(19px,1.9vw,27px);font-weight:500;line-height:1.12}
.toh-menu-item p{font-size:14px;line-height:1.65}
.toh-menu-item strong{font-size:13px;letter-spacing:.04em}
.toh-menu-section{margin:34px 0 8px;padding-bottom:10px;border-bottom:1px solid var(--toh-hairline);font-weight:850}
.toh-review{padding:clamp(24px,3vw,38px)}
.toh-review blockquote{font-size:clamp(20px,2.2vw,30px);letter-spacing:-.025em}
.toh-offering img{height:clamp(210px,23vw,320px)}
.toh-offering-copy{padding:clamp(22px,3vw,32px)}
.toh-offering h3{font-family:var(--display);font-size:clamp(22px,2.2vw,34px);font-weight:500;letter-spacing:-.025em}
.reservation-frame-shell{box-shadow:var(--toh-shadow-soft)}
.site-footer{border-top:1px solid var(--toh-hairline)}

/* Fine-dining editorial: restrained rules, asymmetric imagery, menu reads like a printed card. */
.composition-editorial_luxury .site-nav,.composition-classic_bistro .site-nav{letter-spacing:.04em}
.composition-editorial_luxury .hero-media,.composition-classic_bistro .hero-media{box-shadow:18px 24px 0 var(--surface2)}
.composition-editorial_luxury .toh-menu-grid,.composition-classic_bistro .toh-menu-grid{gap:0;border-top:1px solid var(--border)}
.composition-editorial_luxury .toh-menu-item,.composition-classic_bistro .toh-menu-item{border:0;border-bottom:1px solid var(--border);border-radius:0;background:transparent;padding-left:0;padding-right:0}
.composition-editorial_luxury .toh-menu-item:nth-of-type(odd),.composition-classic_bistro .toh-menu-item:nth-of-type(odd){padding-right:30px}
.composition-editorial_luxury .toh-menu-item:nth-of-type(even),.composition-classic_bistro .toh-menu-item:nth-of-type(even){padding-left:30px}
.composition-editorial_luxury .toh-gallery-grid figure:nth-child(1){grid-column:span 8;min-height:520px}
.composition-editorial_luxury .toh-gallery-grid figure:nth-child(2){grid-column:span 4;margin-top:100px}

/* After-dark / social: cinematic depth and image-led cards. */
.composition-refined_after_dark .site-nav,.composition-bold_social .site-nav,.composition-experiential_escape .site-nav{box-shadow:0 12px 46px rgba(0,0,0,.18)}
.composition-refined_after_dark .hero-media,.composition-bold_social .hero-media,.composition-experiential_escape .hero-media{box-shadow:var(--toh-shadow-deep)}
.composition-refined_after_dark .toh-menu-item,.composition-bold_social .toh-menu-item,.composition-experiential_escape .toh-menu-item{background:linear-gradient(145deg,var(--surface),var(--surface2));border-color:color-mix(in srgb,var(--border) 72%,transparent)}
.composition-bold_social .toh-gallery-grid{gap:18px;transform:rotate(-.35deg)}
.composition-bold_social .toh-gallery-grid figure:nth-child(2){transform:translateY(50px)}
.composition-experiential_escape .toh-offering{box-shadow:0 22px 60px rgba(0,0,0,.18)}

/* Modern conversion-first: crisp surfaces and reservation hierarchy. */
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
.composition-luxury_minimal .toh-rich-section{padding:clamp(96px,12vw,180px) 0}
.composition-luxury_minimal .toh-menu-grid{grid-template-columns:1fr;max-width:860px;margin-left:auto}
.composition-luxury_minimal .toh-menu-item{border-width:0 0 1px;border-radius:0;background:transparent;padding:30px 0}
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

@media(max-width:820px){
  :root{--toh-section-y:70px;--toh-card-pad:22px}
  .site-nav{min-height:66px}
  .toh-rich-head{margin-bottom:28px}
  .composition-editorial_luxury .hero-media,.composition-classic_bistro .hero-media{box-shadow:10px 12px 0 var(--surface2)}
  .composition-editorial_luxury .toh-menu-item:nth-of-type(odd),.composition-editorial_luxury .toh-menu-item:nth-of-type(even),.composition-classic_bistro .toh-menu-item:nth-of-type(odd),.composition-classic_bistro .toh-menu-item:nth-of-type(even){padding-left:0;padding-right:0}
  .composition-editorial_luxury .toh-gallery-grid figure:nth-child(1),.composition-editorial_luxury .toh-gallery-grid figure:nth-child(2){min-height:unset;margin-top:0}
  .composition-luxury_minimal .toh-rich-section{padding:82px 0}
  .toh-offering img{height:240px}
}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}.hero-media img,.toh-gallery-grid img,.toh-offering img,.nav-link,.button,.toh-menu-item,.toh-review,.toh-offering{transition:none!important}}
`;
}
