import "server-only";

import type { WebsiteArtifactFile } from "@/lib/websites/publish-contract";

const PAGE_RULES = [
  { path: "menu/index.html", title: "Menu", ids: ["menu"] },
  { path: "reservations/index.html", title: "Reservations", ids: ["reserve"] },
  { path: "events/index.html", title: "Events & Experiences", ids: ["events-experiences"] },
  { path: "gallery/index.html", title: "Gallery", ids: ["gallery"] },
  { path: "visit/index.html", title: "Visit", ids: ["hours", "visit"] },
] as const;

function extractSection(html: string, id: string) {
  const marker = `id=\"${id}\"`;
  const at = html.indexOf(marker);
  if (at < 0) return "";
  const start = html.lastIndexOf("<section", at);
  if (start < 0) return "";
  const end = html.indexOf("</section>", at);
  return end < 0 ? "" : html.slice(start, end + "</section>".length);
}

function shellFromIndex(index: string, pageTitle: string, body: string) {
  const headEnd = index.indexOf("</head>");
  if (headEnd < 0) return index;
  const head = index.slice(0, headEnd).replace(/<title>[\s\S]*?<\/title>/i, `<title>${pageTitle}</title>`);
  const headerMatch = index.match(/<header[\s\S]*?<\/header>/i)?.[0] || "";
  const footerMatch = index.match(/<footer[\s\S]*?<\/footer>/i)?.[0] || "";
  const nav = headerMatch
    .replace(/href=\"#top\"/g, 'href="/"')
    .replace(/href=\"#visit\"/g, 'href="/visit/"')
    .replace(/href=\"#reserve\"/g, 'href="/reservations/"');
  const pageNav = `<nav class="toh-page-nav" aria-label="Website pages"><a href="/">Home</a><a href="/menu/">Menu</a><a href="/reservations/">Reservations</a><a href="/events/">Events</a><a href="/gallery/">Gallery</a><a href="/visit/">Visit</a></nav>`;
  const footer = footerMatch.replace(/href=\"#reserve\"/g, 'href="/reservations/"');
  return `${head}<style>.toh-page-main{width:min(var(--max),calc(100% - 40px));margin:0 auto;padding:clamp(54px,8vw,110px) 0}.toh-page-nav{display:flex;gap:18px;overflow:auto;padding:14px max(20px,calc((100vw - var(--max))/2));border-bottom:1px solid var(--border);font:800 11px/1 var(--body);text-transform:uppercase;letter-spacing:.08em}.toh-page-nav a{white-space:nowrap;opacity:.7}.toh-page-nav a:hover{opacity:1}.toh-page-main>.toh-rich-section,.toh-page-main>.reservation-section,.toh-page-main>.content-section{width:100%;padding-top:36px}</style></head><body>${nav}${pageNav}<main class="toh-page-main">${body}</main>${footer}</body></html>`;
}

export function addGeneratedWebsitePages(files: WebsiteArtifactFile[]): WebsiteArtifactFile[] {
  const index = files.find((file) => file.path === "index.html");
  if (!index?.content) return files;
  const extra: WebsiteArtifactFile[] = [];
  for (const page of PAGE_RULES) {
    const body = page.ids.map((id) => extractSection(index.content, id)).filter(Boolean).join("\n");
    if (!body) continue;
    extra.push({ path: page.path, content: shellFromIndex(index.content, page.title, body), contentType: "text/html; charset=utf-8", encoding: "utf8" });
  }
  const enhancedIndex = {
    ...index,
    content: index.content.replace("</header>", `</header><nav class="toh-page-nav" aria-label="Website pages"><a href="/">Home</a><a href="/menu/">Menu</a><a href="/reservations/">Reservations</a><a href="/events/">Events</a><a href="/gallery/">Gallery</a><a href="/visit/">Visit</a></nav>`).replace("</style>", `.toh-page-nav{display:flex;gap:18px;overflow:auto;padding:14px max(20px,calc((100vw - var(--max))/2));border-bottom:1px solid var(--border);font:800 11px/1 var(--body);text-transform:uppercase;letter-spacing:.08em}.toh-page-nav a{white-space:nowrap;opacity:.7}.toh-page-nav a:hover{opacity:1}</style>`),
  };
  return files.filter((file) => file.path !== "index.html").concat(enhancedIndex, extra);
}
