import "server-only";

import type { WebsiteArtifactFile } from "@/lib/websites/publish-contract";

type PageRule = {
  path: string;
  title: string;
  navLabel: string;
  ids?: string[];
  classes?: string[];
};

const PAGE_RULES: PageRule[] = [
  { path: "about/index.html", title: "About", navLabel: "About", classes: ["about-section"] },
  { path: "menu/index.html", title: "Menu", navLabel: "Menu", ids: ["menu"] },
  { path: "reservations/index.html", title: "Reservations", navLabel: "Reservations", ids: ["reserve"] },
  { path: "events/index.html", title: "Events & Experiences", navLabel: "Events", ids: ["events-experiences"] },
  { path: "gallery/index.html", title: "Gallery", navLabel: "Gallery", ids: ["gallery"] },
  { path: "reviews/index.html", title: "Reviews", navLabel: "Reviews", ids: ["reviews"] },
  { path: "visit/index.html", title: "Visit", navLabel: "Visit", ids: ["hours"], classes: ["visit-section"] },
  { path: "contact/index.html", title: "Contact", navLabel: "Contact", classes: ["visit-section"] },
];

function extractSectionAt(html: string, at: number) {
  if (at < 0) return "";
  const start = html.lastIndexOf("<section", at);
  if (start < 0) return "";
  const end = html.indexOf("</section>", at);
  return end < 0 ? "" : html.slice(start, end + "</section>".length);
}

function extractById(html: string, id: string) {
  return extractSectionAt(html, html.indexOf(`id=\"${id}\"`));
}

function extractByClass(html: string, className: string) {
  const classPattern = new RegExp(`<section[^>]*class=\"[^\"]*\\b${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^\"]*\"`, "i");
  const match = classPattern.exec(html);
  return extractSectionAt(html, match?.index ?? -1);
}

function pageBody(index: string, rule: PageRule) {
  const sections = new Set<string>();
  for (const id of rule.ids || []) {
    const section = extractById(index, id);
    if (section) sections.add(section);
  }
  for (const className of rule.classes || []) {
    const section = extractByClass(index, className);
    if (section) sections.add(section);
  }
  return [...sections].join("\n");
}

function hrefForPath(path: string) {
  const directory = path.replace(/index\.html$/, "");
  return `/${directory}`.replace(/\/+/g, "/");
}

function navHtml(pages: Array<{ path: string; label: string }>) {
  const links = [{ path: "/", label: "Home" }, ...pages.map((page) => ({ path: hrefForPath(page.path), label: page.label }))];
  return `<nav class="toh-page-nav" aria-label="Website pages">${links.map((link) => `<a href="${link.path}">${link.label}</a>`).join("")}</nav>`;
}

function shellFromIndex(index: string, pageTitle: string, body: string, pageNav: string) {
  const headEnd = index.indexOf("</head>");
  if (headEnd < 0) return index;
  const head = index.slice(0, headEnd).replace(/<title>[\s\S]*?<\/title>/i, `<title>${pageTitle}</title>`);
  const headerMatch = index.match(/<header[\s\S]*?<\/header>/i)?.[0] || "";
  const footerMatch = index.match(/<footer[\s\S]*?<\/footer>/i)?.[0] || "";
  const header = headerMatch
    .replace(/href=\"#top\"/g, 'href="/"')
    .replace(/href=\"#visit\"/g, 'href="/visit/"')
    .replace(/href=\"#reserve\"/g, 'href="/reservations/"');
  const footer = footerMatch.replace(/href=\"#reserve\"/g, 'href="/reservations/"');
  return `${head}<style>.toh-page-main{width:min(var(--max),calc(100% - 40px));margin:0 auto;padding:clamp(54px,8vw,110px) 0}.toh-page-nav{display:flex;gap:18px;overflow:auto;padding:14px max(20px,calc((100vw - var(--max))/2));border-bottom:1px solid var(--border);font:800 11px/1 var(--body);text-transform:uppercase;letter-spacing:.08em}.toh-page-nav a{white-space:nowrap;opacity:.7}.toh-page-nav a:hover,.toh-page-nav a:focus-visible{opacity:1}.toh-page-main>.toh-rich-section,.toh-page-main>.reservation-section,.toh-page-main>.content-section{width:100%;padding-top:36px}</style></head><body>${header}${pageNav}<main class="toh-page-main">${body}</main>${footer}</body></html>`;
}

export function addGeneratedWebsitePages(files: WebsiteArtifactFile[]): WebsiteArtifactFile[] {
  const index = files.find((file) => file.path === "index.html");
  if (!index?.content) return files;

  const emitted = PAGE_RULES.map((rule) => ({ rule, body: pageBody(index.content!, rule) })).filter((entry) => Boolean(entry.body));
  const navPages = emitted.map(({ rule }) => ({ path: rule.path, label: rule.navLabel }));
  const pageNav = navHtml(navPages);
  const extra: WebsiteArtifactFile[] = emitted.map(({ rule, body }) => ({
    path: rule.path,
    content: shellFromIndex(index.content!, rule.title, body, pageNav),
    contentType: "text/html; charset=utf-8",
    encoding: "utf8",
  }));

  const enhancedIndex = {
    ...index,
    content: index.content
      .replace("</header>", `</header>${pageNav}`)
      .replace("</style>", `.toh-page-nav{display:flex;gap:18px;overflow:auto;padding:14px max(20px,calc((100vw - var(--max))/2));border-bottom:1px solid var(--border);font:800 11px/1 var(--body);text-transform:uppercase;letter-spacing:.08em}.toh-page-nav a{white-space:nowrap;opacity:.7}.toh-page-nav a:hover,.toh-page-nav a:focus-visible{opacity:1}</style>`),
  };
  return files.filter((file) => file.path !== "index.html").concat(enhancedIndex, extra);
}
