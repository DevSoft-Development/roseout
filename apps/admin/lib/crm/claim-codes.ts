import "server-only";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export type SearchParams = Record<string, string | undefined>;

const PAGE_SIZE = 25;
const escapeLike = (value: string) => value.replace(/[%_]/g, "\\$&");

export async function listClaimCodes(params: SearchParams) {
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = page * PAGE_SIZE - 1;
  let query = getAdminDatabaseClient()
    .from("location_claim_codes")
    .select("*,locations(id,name,city,state),crm_accounts(id,name)", { count: "exact" });

  if (params.status) query = query.eq("status", params.status);
  if (params.q) {
    const q = escapeLike(params.q);
    query = query.or(`claim_code.ilike.%${q}%,claim_url.ilike.%${q}%`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0, page, from, to };
}
