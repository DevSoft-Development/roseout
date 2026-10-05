import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocketTransport from "next/dist/compiled/ws";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type OperationalShardAccessMode = "read" | "write";

type OperationalShardRuntimeConfig = {
  url: string;
  serviceRoleKey: string;
  readEnabled?: boolean;
  writeEnabled?: boolean;
};

type OperationalShardRuntimeMap = Record<string, OperationalShardRuntimeConfig>;

const shardClients = new Map<string, { fingerprint: string; client: SupabaseClient }>();

function cleanShardId(value: unknown): string {
  const shardId = String(value ?? "primary").trim().toLowerCase();
  return shardId || "primary";
}

function parseOperationalShardConfig(): OperationalShardRuntimeMap {
  const raw = String(process.env.OPERATIONAL_SHARDS_JSON || "").trim();
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("operational_shard_invalid_config");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("operational_shard_invalid_config");
  }

  const result: OperationalShardRuntimeMap = {};
  for (const [rawId, value] of Object.entries(parsed as Record<string, unknown>)) {
    const id = cleanShardId(rawId);
    if (id === "primary") continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("operational_shard_invalid_config");
    }
    const entry = value as Record<string, unknown>;
    const url = String(entry.url || "").trim();
    const serviceRoleKey = String(entry.serviceRoleKey || "").trim();
    if (!url || !serviceRoleKey) throw new Error("operational_shard_invalid_config");
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:") throw new Error();
    } catch {
      throw new Error("operational_shard_invalid_config");
    }
    result[id] = {
      url,
      serviceRoleKey,
      readEnabled: entry.readEnabled !== false,
      writeEnabled: entry.writeEnabled !== false,
    };
  }
  return result;
}

export function operationalShardIdForLocation(location: Record<string, any>): string {
  return cleanShardId(location.operational_shard_id);
}

export function getOperationalShardClient(
  shardIdInput: string,
  mode: OperationalShardAccessMode = "write",
): SupabaseClient {
  const shardId = cleanShardId(shardIdInput);
  if (shardId === "primary") return getSupabaseAdminClient();

  const config = parseOperationalShardConfig()[shardId];
  if (!config) throw new Error("operational_shard_unconfigured");
  if (mode === "read" && config.readEnabled === false) {
    throw new Error("operational_shard_read_disabled");
  }
  if (mode === "write" && config.writeEnabled === false) {
    throw new Error("operational_shard_write_disabled");
  }

  const fingerprint = `${config.url}|${config.serviceRoleKey}`;
  const existing = shardClients.get(shardId);
  if (existing?.fingerprint === fingerprint) return existing.client;

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocketTransport },
  });
  shardClients.set(shardId, { fingerprint, client });
  return client;
}

export function getOperationalShardClientForLocation(
  location: Record<string, any>,
  mode: OperationalShardAccessMode = "write",
): SupabaseClient {
  return getOperationalShardClient(operationalShardIdForLocation(location), mode);
}

export async function resolveOperationalShardForLocationId(
  locationId: string,
  mode: OperationalShardAccessMode = "write",
) {
  const cleanLocationId = String(locationId || "").trim();
  if (!cleanLocationId) throw new Error("missing_location_id");

  const control = getSupabaseAdminClient();
  const { data: location, error } = await control
    .from("locations")
    .select("id,operational_shard_id")
    .eq("id", cleanLocationId)
    .maybeSingle();

  if (error) throw new Error(error.message || "operational_shard_lookup_failed");
  if (!location?.id) throw new Error("location_not_found");

  const shardId = cleanShardId(location.operational_shard_id);
  return {
    shardId,
    client: getOperationalShardClient(shardId, mode),
  };
}
