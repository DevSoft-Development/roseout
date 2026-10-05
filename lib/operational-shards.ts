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

export type OperationalShardResolutionOptions = {
  mode?: OperationalShardAccessMode;
  expectedAssignmentEpoch?: number;
  expectedRoutingEpoch?: number;
};

const shardClients = new Map<string, { fingerprint: string; client: SupabaseClient }>();

function cleanShardId(value: unknown): string {
  const shardId = String(value ?? "primary").trim().toLowerCase();
  return shardId || "primary";
}

function positiveEpoch(value: unknown, fallback = 1): number {
  const epoch = Number(value ?? fallback);
  if (!Number.isSafeInteger(epoch) || epoch < 1) throw new Error("operational_shard_invalid_epoch");
  return epoch;
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
  mode: OperationalShardAccessMode = "read",
): SupabaseClient {
  if (mode === "write") {
    throw new Error("operational_shard_write_requires_authoritative_resolution");
  }
  return getOperationalShardClient(operationalShardIdForLocation(location), mode);
}

export async function resolveOperationalShardForLocationId(
  locationId: string,
  options: OperationalShardResolutionOptions = {},
) {
  const mode = options.mode || "write";
  const cleanLocationId = String(locationId || "").trim();
  if (!cleanLocationId) throw new Error("missing_location_id");

  const control = getSupabaseAdminClient();
  const { data: location, error } = await control
    .from("locations")
    .select("id,operational_shard_id,operational_shard_epoch,operational_writes_frozen")
    .eq("id", cleanLocationId)
    .maybeSingle();

  if (error) throw new Error(error.message || "operational_shard_lookup_failed");
  if (!location?.id) throw new Error("location_not_found");

  const assignmentEpoch = positiveEpoch(location.operational_shard_epoch);
  if (
    options.expectedAssignmentEpoch !== undefined &&
    positiveEpoch(options.expectedAssignmentEpoch) !== assignmentEpoch
  ) {
    throw new Error("operational_shard_assignment_epoch_mismatch");
  }
  if (mode === "write" && location.operational_writes_frozen === true) {
    throw new Error("operational_shard_writes_frozen");
  }

  const logicalShardId = cleanShardId(location.operational_shard_id);
  if (logicalShardId === "primary") {
    if (
      options.expectedRoutingEpoch !== undefined &&
      positiveEpoch(options.expectedRoutingEpoch) !== 1
    ) {
      throw new Error("operational_shard_routing_epoch_mismatch");
    }
    return {
      shardId: "primary",
      logicalShardId: "primary",
      physicalShardId: "primary",
      routingEpoch: 1,
      assignmentEpoch,
      failoverState: "primary",
      schemaVersion: 1,
      client: getSupabaseAdminClient(),
    };
  }

  const { data: shard, error: shardError } = await control
    .from("operational_shards")
    .select("id,status,read_enabled,write_enabled,active_physical_shard_id,routing_epoch,failover_state,schema_version")
    .eq("id", logicalShardId)
    .maybeSingle();

  if (shardError) throw new Error(shardError.message || "operational_shard_registry_lookup_failed");
  if (!shard?.id) throw new Error("operational_shard_registry_missing");
  if (shard.status !== "active") throw new Error("operational_shard_not_active");
  if (mode === "read" && shard.read_enabled !== true) throw new Error("operational_shard_read_disabled");
  if (mode === "write" && shard.write_enabled !== true) throw new Error("operational_shard_write_disabled");

  const routingEpoch = positiveEpoch(shard.routing_epoch);
  if (
    options.expectedRoutingEpoch !== undefined &&
    positiveEpoch(options.expectedRoutingEpoch) !== routingEpoch
  ) {
    throw new Error("operational_shard_routing_epoch_mismatch");
  }

  const physicalShardId = cleanShardId(shard.active_physical_shard_id || logicalShardId);
  return {
    shardId: physicalShardId,
    logicalShardId,
    physicalShardId,
    routingEpoch,
    assignmentEpoch,
    failoverState: String(shard.failover_state || "primary"),
    schemaVersion: positiveEpoch(shard.schema_version),
    client: getOperationalShardClient(physicalShardId, mode),
  };
}
