import type { PosHardwareHealth } from "@/lib/pos/hardware/contracts";

export type PosHardwareHeartbeat = {
  deviceId: string;
  health: PosHardwareHealth;
  lastSeenAt: string | null;
};

export type PosHardwareReadiness =
  | "ready"
  | "needs_attention"
  | "offline"
  | "unknown";

export type PosHardwareRecoveryAction =
  | "none"
  | "rediscover"
  | "retry"
  | "failover";

export function readinessFromHeartbeat(
  heartbeat: PosHardwareHeartbeat,
  nowMs = Date.now(),
  staleAfterMs = 2 * 60_000,
): PosHardwareReadiness {
  if (!heartbeat.lastSeenAt) return "unknown";

  const seenAt = new Date(heartbeat.lastSeenAt).getTime();
  if (!Number.isFinite(seenAt) || nowMs - seenAt > staleAfterMs) return "offline";

  if (heartbeat.health === "ready") return "ready";
  if (heartbeat.health === "offline") return "offline";
  if (heartbeat.health === "unknown") return "unknown";
  return "needs_attention";
}

export function recoveryActionFor(
  readiness: PosHardwareReadiness,
  failureCount: number,
): PosHardwareRecoveryAction {
  if (readiness === "ready") return "none";
  if (readiness === "unknown" || readiness === "offline") return "rediscover";
  if (failureCount <= 1) return "retry";
  return "failover";
}

export interface PosHardwareRediscoveryCoordinator {
  rediscover(deviceId: string): Promise<boolean>;
}

export interface PosHardwareHeartbeatWriter {
  record(input: {
    deviceId: string;
    healthStatus: PosHardwareHealth;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export async function healPosHardwareDevice(input: {
  heartbeat: PosHardwareHeartbeat;
  failureCount: number;
  rediscovery: PosHardwareRediscoveryCoordinator;
  heartbeatWriter: PosHardwareHeartbeatWriter;
  nowMs?: number;
  staleAfterMs?: number;
}) {
  const readiness = readinessFromHeartbeat(
    input.heartbeat,
    input.nowMs,
    input.staleAfterMs,
  );
  const action = recoveryActionFor(readiness, input.failureCount);

  if (action === "rediscover") {
    const recovered = await input.rediscovery.rediscover(input.heartbeat.deviceId);
    if (recovered) {
      await input.heartbeatWriter.record({
        deviceId: input.heartbeat.deviceId,
        healthStatus: "ready",
        metadata: { recovered_by: "automatic_rediscovery" },
      });
      return { readiness: "ready" as const, action, recovered: true };
    }
  }

  return { readiness, action, recovered: false };
}

export function plainHardwareStatus(readiness: PosHardwareReadiness) {
  switch (readiness) {
    case "ready":
      return "Ready";
    case "needs_attention":
      return "Needs attention";
    case "offline":
      return "Offline";
    default:
      return "Checking connection";
  }
}
