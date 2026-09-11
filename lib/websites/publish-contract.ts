import "server-only";
import { upgradeGeneratedReservationArtifact } from "@/lib/websites/native-reservation-artifact";

export type WebsiteArtifactFile = {
  path: string;
  content: string;
  encoding?: "utf8";
  contentType?: string;
};

export type WebsiteDeployRedirect = {
  from: string;
  to: string;
};

export type WebsiteDeployRequest = {
  websiteId: string;
  locationId: string;
  version: number;
  sitePath: string;
  domain: string | null;
  files: WebsiteArtifactFile[];
  redirects?: WebsiteDeployRedirect[];
};

export function assertSafeArtifactPath(path: string) {
  const value = path.trim();
  if (!value || value.startsWith("/") || value.includes("..") || value.includes("\\")) {
    throw new Error("invalid_artifact_path");
  }
  return value;
}

function normalizeRedirectPath(value: string, source: boolean) {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("..") || path.includes("\n") || path.includes("\r")) {
    throw new Error("invalid_redirect_path");
  }
  if (source && path.includes("?")) throw new Error("invalid_redirect_source");
  return path.replace(/\/+/g, "/");
}

function normalizeRedirects(input: WebsiteDeployRedirect[] | undefined) {
  if (!input) return undefined;
  if (!Array.isArray(input) || input.length > 30) throw new Error("invalid_redirects");
  const seen = new Set<string>();
  const redirects: WebsiteDeployRedirect[] = [];
  for (const rule of input) {
    const from = normalizeRedirectPath(rule?.from, true);
    const to = normalizeRedirectPath(rule?.to, false);
    if (from === "/" || from === to || seen.has(from)) continue;
    seen.add(from);
    redirects.push({ from, to });
  }
  return redirects;
}

export function normalizeDeployRequest(input: WebsiteDeployRequest): WebsiteDeployRequest {
  if (!input.websiteId || !input.locationId || !Number.isInteger(input.version) || input.version < 1) {
    throw new Error("invalid_deploy_request");
  }
  if (!input.sitePath.startsWith(`/srv/sites/${input.locationId}`)) {
    throw new Error("invalid_site_path");
  }
  if (!input.files.length || input.files.length > 50) throw new Error("invalid_artifact_files");

  const upgradedFiles = upgradeGeneratedReservationArtifact(input.files, input.locationId);

  return {
    ...input,
    redirects: normalizeRedirects(input.redirects),
    files: upgradedFiles.map((file) => ({
      ...file,
      path: assertSafeArtifactPath(file.path),
      content: String(file.content || ""),
      encoding: "utf8",
    })),
  };
}
