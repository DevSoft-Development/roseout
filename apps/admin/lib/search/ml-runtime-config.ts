import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

type SearchMlRuntimeConfig = {
  endpoint: string;
  token: string;
};

let cache: { value: SearchMlRuntimeConfig; expiresAt: number } | null = null;

async function readDatabaseConfig() {
  try {
    const { data, error } = await getAdminDatabaseClient().rpc("get_search_ml_runtime_config");
    if (error) throw error;
    return (Array.isArray(data) ? data[0] : data) ?? null;
  } catch {
    return null;
  }
}

export async function resolveSearchMlRuntimeConfig(): Promise<SearchMlRuntimeConfig> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const db = await readDatabaseConfig();
  const value = {
    endpoint: String(process.env.SEARCH_HF_EMBEDDING_ENDPOINT || process.env.SEARCH_HF_ML_ENDPOINT || db?.endpoint || "").trim().replace(/\/+$/, ""),
    token: String(process.env.SEARCH_HF_EMBEDDING_TOKEN || process.env.SEARCH_HF_ML_TOKEN || db?.auth_token || "").trim(),
  };
  cache = { value, expiresAt: Date.now() + 60_000 };
  return value;
}
