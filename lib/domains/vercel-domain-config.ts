import type { GatewayDnsRecord } from "@/lib/domains/dns-records";

export type VercelDomainConfig = {
  configuredBy?: "A" | "CNAME" | "dns-01" | "http" | null;
  recommendedIPv4?: Array<{ rank?: number; value?: string[] }>;
  recommendedCNAME?: Array<{ rank?: number; value?: string }>;
  misconfigured?: boolean;
};

function preferredRank<T extends { rank?: number }>(items: T[] | undefined): T | null {
  if (!items?.length) return null;
  return [...items].sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))[0] || null;
}

export function buildRecommendedVercelRecords(config: VercelDomainConfig): GatewayDnsRecord[] {
  const records: GatewayDnsRecord[] = [];
  const ipv4 = preferredRank(config.recommendedIPv4)?.value?.find((value) => typeof value === "string" && value.trim());
  const cname = preferredRank(config.recommendedCNAME)?.value;

  if (ipv4) records.push({ type: "A", name: "@", value: ipv4.trim() });
  if (cname?.trim()) records.push({ type: "CNAME", name: "www", value: cname.trim().replace(/\.$/, "") });
  return records;
}
