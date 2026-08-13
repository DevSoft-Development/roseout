import "server-only";

type VercelProjectDomain = {
  name?: string;
  verified?: boolean;
  verification?: Array<{ type?: string; domain?: string; value?: string; reason?: string }>;
  misconfigured?: boolean;
};

export type VercelDomainConfiguration = {
  configuredBy?: "A" | "CNAME" | "dns-01" | "http" | null;
  acceptedChallenges?: Array<"dns-01" | "http-01">;
  recommendedIPv4?: Array<{ rank?: number; value?: string[] }>;
  recommendedCNAME?: Array<{ rank?: number; value?: string }>;
  misconfigured?: boolean;
};

function config() {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (!token || !projectId || !teamId) throw new Error("vercel_domain_config_missing");
  return { token, projectId, teamId };
}

async function vercelRequest(path: string, init?: RequestInit) {
  const { token } = config();
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("content-type", "application/json");
  const response = await fetch(`https://api.vercel.com${path}`, { ...init, headers, cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof body?.error?.code === "string" ? body.error.code : "vercel_domain_request_failed";
    throw new Error(code);
  }
  return body;
}

export async function addDomainToVercelProject(domain: string): Promise<VercelProjectDomain> {
  const { projectId, teamId } = config();
  return vercelRequest(`/v10/projects/${encodeURIComponent(projectId)}/domains?teamId=${encodeURIComponent(teamId)}`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
}

export async function getVercelProjectDomain(domain: string): Promise<VercelProjectDomain> {
  const { projectId, teamId } = config();
  return vercelRequest(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}?teamId=${encodeURIComponent(teamId)}`);
}

export async function getVercelDomainConfiguration(domain: string): Promise<VercelDomainConfiguration> {
  const { projectId, teamId } = config();
  const query = new URLSearchParams({ projectIdOrName: projectId, teamId });
  return vercelRequest(`/v6/domains/${encodeURIComponent(domain)}/config?${query.toString()}`);
}

export async function verifyVercelProjectDomain(domain: string): Promise<VercelProjectDomain> {
  const { projectId, teamId } = config();
  return vercelRequest(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}/verify?teamId=${encodeURIComponent(teamId)}`, {
    method: "POST",
    body: "{}",
  });
}
