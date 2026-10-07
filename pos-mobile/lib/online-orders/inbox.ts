import * as Notifications from "expo-notifications";
import type { PosClaimSession } from "@/lib/device/identity";
import { RoleBasedPosOutputRouter } from "@/lib/output/routing";
import { securePosOutputRouteSource } from "@/lib/output/route-store";
import { syncManagedOutputRoutes } from "@/lib/output/managed-resolver";

type DispatchPayload = {
  dispatchId: string;
  onlineOrderId: string;
  notify: boolean;
  autoPrint: boolean;
  order: {
    id: string;
    status: string;
    customerName: string;
    promisedPickupAt: string | null;
    totalCents: number;
  };
  outputs: Array<{
    role: "receipt" | "kitchen_hot_line" | "kitchen_cold_line" | "bar" | "expo" | "prep";
    text: string;
  }>;
};

function bytes(value: string) {
  const utf8 = unescape(encodeURIComponent(value));
  return new Uint8Array([...utf8].map((character) => character.charCodeAt(0)));
}

async function notifyNewOrder(dispatch: DispatchPayload) {
  if (!dispatch.notify) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    const requested = await Notifications.requestPermissionsAsync();
    if (!requested.granted) return;
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "New online order",
      body: `${dispatch.order.customerName} · ${dispatch.order.promisedPickupAt ? "Pickup scheduled" : "ASAP pickup"}`,
      sound: "default",
      data: { onlineOrderId: dispatch.onlineOrderId },
    },
    trigger: null,
  });
}

async function acknowledge(input: {
  baseUrl: string;
  session: PosClaimSession;
  dispatchId: string;
  success: boolean;
  error?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const response = await fetch(
    `${input.baseUrl.replace(/\/$/, "")}/api/business/pos/devices/orders`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.session.credential}`,
        "X-POS-Device-ID": input.session.deviceId,
      },
      body: JSON.stringify({
        dispatchId: input.dispatchId,
        success: input.success,
        error: input.error || null,
        metadata: input.metadata || {},
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || "pos_order_dispatch_ack_failed");
}

export async function processOnlineOrderInboxOnce(input: {
  baseUrl: string;
  session: PosClaimSession;
}) {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/business/pos/devices/orders`, {
    headers: {
      Authorization: `Bearer ${input.session.credential}`,
      "X-POS-Device-ID": input.session.deviceId,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || "pos_order_inbox_failed");
  const dispatch = body.dispatch as DispatchPayload | null;
  if (!dispatch) return { handled: false as const };

  const outputResults: Array<{ role: string; deviceId?: string; error?: string }> = [];
  try {
    await notifyNewOrder(dispatch);

    if (dispatch.autoPrint && dispatch.outputs.length) {
      const endpoints = await syncManagedOutputRoutes({ baseUrl, session: input.session });
      const router = new RoleBasedPosOutputRouter(securePosOutputRouteSource, endpoints);
      for (const output of dispatch.outputs) {
        try {
          const deviceId = await router.send(output.role, bytes(output.text));
          outputResults.push({ role: output.role, deviceId });
        } catch (error) {
          outputResults.push({
            role: output.role,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const requiredFailure = outputResults.find((result) => result.error);
      if (requiredFailure) {
        throw new Error(`pos_online_order_output_failed:${requiredFailure.role}:${requiredFailure.error}`);
      }
    }

    await acknowledge({
      baseUrl,
      session: input.session,
      dispatchId: dispatch.dispatchId,
      success: true,
      metadata: { notified: dispatch.notify, auto_print: dispatch.autoPrint, outputs: outputResults },
    });
    return { handled: true as const, dispatch, outputResults };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await acknowledge({
      baseUrl,
      session: input.session,
      dispatchId: dispatch.dispatchId,
      success: false,
      error: message,
      metadata: { outputs: outputResults },
    }).catch(() => undefined);
    throw error;
  }
}

export function startOnlineOrderInboxLoop(input: {
  baseUrl: string;
  session: PosClaimSession;
  onOrder?: (dispatch: DispatchPayload) => void;
  onError?: (error: Error) => void;
  intervalMs?: number;
}) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const intervalMs = Math.max(2000, input.intervalMs || 5000);

  const tick = async () => {
    if (stopped) return;
    try {
      const result = await processOnlineOrderInboxOnce(input);
      if (result.handled) input.onOrder?.(result.dispatch);
    } catch (error) {
      input.onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
