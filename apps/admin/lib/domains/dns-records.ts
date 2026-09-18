export type GatewayDnsRecord = { type: "A" | "CNAME" | "TXT"; name: string; value: string };

export function buildDnsRecords(domain: string, ipv4: string | null, cname: string | null, verification: Array<{type?: string; domain?: string; value?: string}> = []): GatewayDnsRecord[] {
  const apex = domain.trim().toLowerCase().replace(/\.$/, "");
  const records: GatewayDnsRecord[] = [];
  if (ipv4) records.push({ type: "A", name: "@", value: ipv4.trim() });
  if (cname) records.push({ type: "CNAME", name: "www", value: cname.trim().replace(/\.$/, "") });
  for (const item of verification) {
    if (String(item?.type || "").toUpperCase() !== "TXT") continue;
    const value = String(item?.value || "").trim();
    if (!value) continue;
    const host = String(item?.domain || "").trim().toLowerCase().replace(/\.$/, "");
    const name = !host || host === apex ? "@" : host.endsWith(`.${apex}`) ? host.slice(0, -(apex.length + 1)) : host;
    records.push({ type: "TXT", name, value });
  }
  return records.filter((record, index, all) => all.findIndex((other) => other.type === record.type && other.name === record.name && other.value === record.value) === index);
}
