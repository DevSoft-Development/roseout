import "server-only";

import type { BusinessWebsite } from "@/lib/websites/data";
import type { WebsiteArtifactFile } from "@/lib/websites/publish-contract";

type RedirectEntry = { from?: unknown; to?: unknown };

function safeSourcePath(value: unknown) {
  const raw = String(value || "/").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("..") || raw.includes("\\") || raw.includes("?")) return null;
  return raw.replace(/\/+/g, "/");
}

function safeTargetPath(value: unknown) {
  const raw = String(value || "/").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}

function artifactPath(from: string) {
  if (from === "/") return null;
  const clean = from.replace(/^\/+|\/+$/g, "");
  if (!clean) return null;
  if (/\.[a-z0-9]{2,8}$/i.test(clean)) return `${clean}.html`;
  return `${clean}/index.html`;
}

function redirectHtml(to: string) {
  const escaped = to.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${escaped}"><link rel="canonical" href="${escaped}"><script>location.replace(${JSON.stringify(to)});</script></head><body><p>This page moved to <a href="${escaped}">${escaped}</a>.</p></body></html>`;
}

export function addMigrationRedirectArtifacts(files: WebsiteArtifactFile[], website: BusinessWebsite): WebsiteArtifactFile[] {
  const custom = website.custom_content && typeof website.custom_content === "object" ? website.custom_content as Record<string, unknown> : {};
  const imported = custom.website_import && typeof custom.website_import === "object" ? custom.website_import as Record<string, unknown> : {};
  const manifest = imported.migration_manifest && typeof imported.migration_manifest === "object" ? imported.migration_manifest as Record<string, unknown> : {};
  const entries = Array.isArray(manifest.redirect_map) ? manifest.redirect_map as RedirectEntry[] : [];
  const existing = new Set(files.map((file) => file.path));
  const redirects: WebsiteArtifactFile[] = [];

  for (const entry of entries.slice(0, 30)) {
    const from = safeSourcePath(entry.from);
    const to = safeTargetPath(entry.to);
    if (!from || from === to) continue;
    const path = artifactPath(from);
    if (!path || existing.has(path)) continue;
    existing.add(path);
    redirects.push({ path, content: redirectHtml(to), contentType: "text/html; charset=utf-8", encoding: "utf8" });
  }

  return [...files, ...redirects];
}
