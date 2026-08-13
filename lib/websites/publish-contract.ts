import "server-only";

export type WebsiteArtifactFile = {
  path: string;
  content: string;
  encoding: "utf8";
};

export type WebsiteDeployRequest = {
  websiteId: string;
  locationId: string;
  version: number;
  sitePath: string;
  domain: string | null;
  files: WebsiteArtifactFile[];
};

export function assertSafeArtifactPath(path: string) {
  const value = path.trim();
  if (!value || value.startsWith("/") || value.includes("..") || value.includes("\\")) {
    throw new Error("invalid_artifact_path");
  }
  return value;
}

export function normalizeDeployRequest(input: WebsiteDeployRequest): WebsiteDeployRequest {
  if (!input.websiteId || !input.locationId || !Number.isInteger(input.version) || input.version < 1) {
    throw new Error("invalid_deploy_request");
  }
  if (!input.sitePath.startsWith(`/srv/sites/${input.locationId}`)) {
    throw new Error("invalid_site_path");
  }
  if (!input.files.length || input.files.length > 50) throw new Error("invalid_artifact_files");

  return {
    ...input,
    files: input.files.map((file) => ({
      ...file,
      path: assertSafeArtifactPath(file.path),
      content: String(file.content || ""),
      encoding: "utf8",
    })),
  };
}
