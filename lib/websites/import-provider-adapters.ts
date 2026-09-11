export type WebsiteImportAdapterId =
  | "wordpress"
  | "wix"
  | "squarespace"
  | "toast"
  | "bentobox"
  | "popmenu"
  | "webflow"
  | "shopify"
  | "square_weebly"
  | "duda"
  | "godaddy"
  | "hostinger"
  | "generic";

export type WebsiteImportAdapter = {
  id: WebsiteImportAdapterId;
  label: string;
  signatures: RegExp[];
  contentHints: string[];
  reservationHints: string[];
  assetHints: string[];
};

export const WEBSITE_IMPORT_ADAPTERS: WebsiteImportAdapter[] = [
  { id:"wordpress", label:"WordPress", signatures:[/wp-content/i,/wp-includes/i,/wordpress/i], contentHints:["wp-json/wp/v2/pages","wp-json/wp/v2/media","wp-json/wp/v2/posts"], reservationHints:["reservation","book","reserve"], assetHints:["wp-content/uploads"] },
  { id:"wix", label:"Wix", signatures:[/wixstatic/i,/wix\.com/i,/wix-code/i], contentHints:["wix-data","site-pages","seo"], reservationHints:["wixbookings","reservation","book"], assetHints:["static.wixstatic.com"] },
  { id:"squarespace", label:"Squarespace", signatures:[/squarespace/i,/static1\.squarespace/i], contentHints:["collection","sqs-block","sqs-layout"], reservationHints:["acuityscheduling","reservation","book"], assetHints:["images.squarespace-cdn.com","static1.squarespace.com"] },
  { id:"toast", label:"Toast", signatures:[/toasttab/i,/toast\.site/i,/toast-sites/i], contentHints:["menus","locations","hours"], reservationHints:["toasttab.com/reserve","tables","reservation"], assetHints:["toasttab","toast.site"] },
  { id:"bentobox", label:"BentoBox", signatures:[/bentobox/i,/getbento/i], contentHints:["menus","private-events","catering","locations"], reservationHints:["reserve","reservation","resy","opentable"], assetHints:["getbento.com"] },
  { id:"popmenu", label:"Popmenu", signatures:[/popmenu/i,/pop-menu/i], contentHints:["menu","locations","events","catering"], reservationHints:["reservation","reserve","book"], assetHints:["popmenucloud.com","popmenu.com"] },
  { id:"webflow", label:"Webflow", signatures:[/webflow/i,/website-files\.com/i], contentHints:["w-dyn-list","w-richtext","collection"], reservationHints:["reservation","reserve","book"], assetHints:["website-files.com"] },
  { id:"shopify", label:"Shopify", signatures:[/cdn\.shopify/i,/shopify/i,/myshopify/i], contentHints:["collections","products","pages"], reservationHints:["booking","reservation","reserve"], assetHints:["cdn.shopify.com"] },
  { id:"square_weebly", label:"Square / Weebly", signatures:[/square\.site/i,/weebly/i,/editmysite/i], contentHints:["store","menu","pages"], reservationHints:["squareup.com/appointments","reservation","book"], assetHints:["editmysite.com"] },
  { id:"duda", label:"Duda", signatures:[/duda/i,/multiscreensite/i], contentHints:["dmRespRow","dmNewParagraph","dmWidget"], reservationHints:["reservation","reserve","book"], assetHints:["multiscreensite.com"] },
  { id:"godaddy", label:"GoDaddy Websites + Marketing", signatures:[/godaddysites/i,/secureservercdn/i,/websitebuilder/i], contentHints:["sections","gallery","contact"], reservationHints:["book","reservation","appointment"], assetHints:["secureservercdn.net"] },
  { id:"hostinger", label:"Hostinger Website Builder", signatures:[/hostinger/i,/zyrosite/i,/assets.zyrosite/i], contentHints:["blocks","gallery","contact"], reservationHints:["book","reservation","reserve"], assetHints:["assets.zyrosite.com"] },
  { id:"generic", label:"Website", signatures:[], contentHints:["title","meta description","headings","links"], reservationHints:["reservation","reserve","book"], assetHints:["img","source"] },
];

export function detectWebsiteImportAdapter(html: string, hostname: string) {
  const haystack = `${hostname}\n${html}`;
  return WEBSITE_IMPORT_ADAPTERS.find(adapter => adapter.id !== "generic" && adapter.signatures.some(signature => signature.test(haystack))) || WEBSITE_IMPORT_ADAPTERS[WEBSITE_IMPORT_ADAPTERS.length - 1];
}

export function extractImportSignals(html: string, adapter: WebsiteImportAdapter) {
  const lower = html.toLowerCase();
  return {
    adapter_id: adapter.id,
    provider: adapter.label,
    detected_content_hints: adapter.contentHints.filter(hint => lower.includes(hint.toLowerCase())),
    detected_reservation_hints: adapter.reservationHints.filter(hint => lower.includes(hint.toLowerCase())),
    detected_asset_hints: adapter.assetHints.filter(hint => lower.includes(hint.toLowerCase())),
  };
}
