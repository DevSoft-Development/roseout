import { getThePosHavenHardwareBridge } from "@/lib/hardware/native-bridge";
import type {
  PosOutputRole,
  RoleBasedPosOutputRouter,
} from "@/lib/output/routing";

const OFFLINE_QUEUE_KEY = "offline-command-queue-v1";
const MAX_OFFLINE_COMMANDS = 500;

export type PosOfflineCommandType =
  | "order_sync"
  | "device_event";

export type PosOfflineCommand = {
  idempotencyKey: string;
  type: PosOfflineCommandType;
  createdAt: string;
  attempts: number;
  payload: Record<string, unknown>;
};

export interface PosOfflineCommandTransport {
  send(command: PosOfflineCommand): Promise<void>;
}

export type PosLocalOutput = {
  role: PosOutputRole;
  payload: Uint8Array;
};

type OfflineQueueSnapshot = {
  version: 1;
  commands: PosOfflineCommand[];
};

let queueLock: Promise<unknown> = Promise.resolve();

function required(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`pos_offline_missing_${field}`);
  return normalized;
}

function normalizedKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const forbiddenPaymentKeys = new Set([
  "pan",
  "cardnumber",
  "accountnumber",
  "cvv",
  "cvc",
  "track1",
  "track2",
  "magstripe",
  "clientsecret",
  "paymentsecret",
  "stripesecret",
]);

function assertNoCardSecrets(value: unknown, path = "payload") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoCardSecrets(item, `${path}[${index}]`),
    );
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenPaymentKeys.has(normalizedKey(key))) {
      throw new Error(`pos_offline_forbidden_payment_data:${path}.${key}`);
    }
    assertNoCardSecrets(child, `${path}.${key}`);
  }
}

async function readQueue(): Promise<OfflineQueueSnapshot> {
  const raw = await getThePosHavenHardwareBridge().readState(OFFLINE_QUEUE_KEY);
  if (!raw) return { version: 1, commands: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<OfflineQueueSnapshot>;
    if (parsed.version !== 1 || !Array.isArray(parsed.commands)) {
      throw new Error("invalid_offline_queue_version");
    }
    return {
      version: 1,
      commands: parsed.commands,
    };
  } catch {
    await getThePosHavenHardwareBridge().deleteState(OFFLINE_QUEUE_KEY);
    return { version: 1, commands: [] };
  }
}

async function writeQueue(snapshot: OfflineQueueSnapshot) {
  await getThePosHavenHardwareBridge().writeState(
    OFFLINE_QUEUE_KEY,
    JSON.stringify(snapshot),
  );
}

function withQueueLock<T>(operation: () => Promise<T>) {
  const next = queueLock.then(operation, operation);
  queueLock = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function enqueuePosOfflineCommand(input: {
  idempotencyKey: string;
  type: PosOfflineCommandType;
  payload: Record<string, unknown>;
}) {
  assertNoCardSecrets(input.payload);

  return withQueueLock(async () => {
    const snapshot = await readQueue();
    const idempotencyKey = required(input.idempotencyKey, "idempotency_key");

    const existing = snapshot.commands.find(
      (command) => command.idempotencyKey === idempotencyKey,
    );
    if (existing) return existing;

    if (snapshot.commands.length >= MAX_OFFLINE_COMMANDS) {
      throw new Error("pos_offline_queue_capacity_reached");
    }

    const command: PosOfflineCommand = {
      idempotencyKey,
      type: input.type,
      createdAt: new Date().toISOString(),
      attempts: 0,
      payload: input.payload,
    };

    snapshot.commands.push(command);
    await writeQueue(snapshot);
    return command;
  });
}

export async function listPosOfflineCommands() {
  return (await readQueue()).commands;
}

export async function replayPosOfflineCommands(
  transport: PosOfflineCommandTransport,
  maxCommands = 50,
) {
  return withQueueLock(async () => {
    const snapshot = await readQueue();
    let replayed = 0;
    let failed: string | null = null;

    while (snapshot.commands.length && replayed < maxCommands) {
      const command = snapshot.commands[0];
      command.attempts += 1;
      await writeQueue(snapshot);

      try {
        await transport.send(command);
      } catch (error) {
        failed = error instanceof Error ? error.message : String(error);
        await writeQueue(snapshot);
        break;
      }

      snapshot.commands.shift();
      replayed += 1;
      await writeQueue(snapshot);
    }

    return {
      replayed,
      remaining: snapshot.commands.length,
      failed,
    };
  });
}

export async function completePosOrderOfflineSafe(input: {
  idempotencyKey: string;
  orderPayload: Record<string, unknown>;
  outputs: readonly PosLocalOutput[];
  router: RoleBasedPosOutputRouter;
}) {
  const queued = await enqueuePosOfflineCommand({
    idempotencyKey: input.idempotencyKey,
    type: "order_sync",
    payload: input.orderPayload,
  });

  const outputResults: Array<{
    role: PosOutputRole;
    deviceId?: string;
    error?: string;
  }> = [];

  for (const output of input.outputs) {
    try {
      const deviceId = await input.router.send(output.role, output.payload);
      outputResults.push({ role: output.role, deviceId });
    } catch (error) {
      outputResults.push({
        role: output.role,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    queued,
    outputResults,
  };
}
