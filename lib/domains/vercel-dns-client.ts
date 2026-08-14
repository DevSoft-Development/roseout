import "server-only";

const VERCEL_API_BASE = "https://api.vercel.com";
const DEFAULT_LIST_API_VERSION = "v5";
const LEGACY_LIST_API_VERSION = "v4";
const DEFAULT_UPDATE_API_VERSION = "v1";

type VercelDnsRecord = {
  id: string;
  name: string;
  type: string;
  value: string;
};

class VercelDnsRequestError extends Error {
  status: number;
  code: string;
  operation: string;

  constructor(operation: string, status: number, code: string) {
    super(`${operation}:${status}:${code}`);
    this.name = "VercelDnsRequestError";
    this.status = status;
    this.code = code;
    this.operation = operation;
  }
}

function config() {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (!token || !teamId) throw new Error("vercel_dns_config_missing");

  return {
    token,
    teamId,
    listApiVersion: process.env.VERCEL_DNS_LIST_API_VERSION?.trim() || DEFAULT_LIST_API_VERSION,
    updateApiVersion: process.env.VERCEL_DNS_UPDATE_API_VERSION?.trim() || DEFAULT_UPDATE_API_VERSION,
  };
}

function normalizeVersion(value: string) {
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

async function vercelRequest(path: string, operation: string, init?: RequestInit) {
  const { token } = config();
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("content-type", "application/json");

  const response = await fetch(`${VERCEL_API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const code = typeof body?.error?.code === "string" ? body.error.code : "vercel_dns_request_failed";
    throw new VercelDnsRequestError(operation, response.status, code);
  }

  return body;
}

function uniqueVersions(values: string[]) {
  return [...new Set(values.map(normalizeVersion).filter(Boolean))];
}

function canTryCompatibilityFallback(error: unknown) {
  return error instanceof VercelDnsRequestError && (error.status === 404 || error.status === 410);
}

export async function listVercelDnsRecords(domain: string): Promise<VercelDnsRecord[]> {
  const { teamId, listApiVersion } = config();
  const versions = uniqueVersions([listApiVersion, DEFAULT_LIST_API_VERSION, LEGACY_LIST_API_VERSION]);
  let lastError: unknown = null;

  for (const version of versions) {
    try {
      const body = await vercelRequest(
        `/${version}/domains/${encodeURIComponent(domain)}/records?teamId=${encodeURIComponent(teamId)}&limit=100`,
        `vercel_dns_list_failed_${version}`,
      );
      return Array.isArray(body?.records) ? (body.records as VercelDnsRecord[]) : [];
    } catch (error) {
      lastError = error;
      if (!canTryCompatibilityFallback(error)) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("vercel_dns_list_failed");
}

export async function updateVercelDnsRecord(recordId: string, value: string, ttl = 60) {
  const { teamId, updateApiVersion } = config();
  const version = normalizeVersion(updateApiVersion);

  return vercelRequest(
    `/${version}/domains/records/${encodeURIComponent(recordId)}?teamId=${encodeURIComponent(teamId)}`,
    `vercel_dns_patch_failed_${version}`,
    {
      method: "PATCH",
      body: JSON.stringify({ value, ttl }),
    },
  );
}

export async function findVercelDnsRecord(domain: string, name: string, type: string) {
  const records = await listVercelDnsRecords(domain);
  return records.find((record) => record.name === name && record.type === type) || null;
}

export async function checkVercelDnsReadCapability(domain: string, name: string, type: string) {
  const record = await findVercelDnsRecord(domain, name, type);
  if (!record?.id) throw new Error("vercel_dns_expected_record_missing");

  return {
    ok: true,
    recordId: record.id,
    value: record.value,
    type: record.type,
    name: record.name,
  };
}
