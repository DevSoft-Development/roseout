import { createWebsitePickupOrder } from "@/lib/pos/online-ordering/service";
import { onlineOrderingErrorStatus, onlineOrderingJson, onlineOrderingOptions } from "@/lib/pos/online-ordering/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return onlineOrderingOptions();
}

export async function POST(request: Request, { params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64 * 1024) {
    return onlineOrderingJson({ ok: false, error: "online_order_payload_too_large" }, { status: 413 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return onlineOrderingJson({ ok: false, error: "online_order_invalid_payload" }, { status: 400 });
  }
  const idempotencyKey = String(
    request.headers.get("idempotency-key") || (body as Record<string, unknown>).idempotencyKey || "",
  ).trim();
  try {
    const result = await createWebsitePickupOrder({
      locationId: String(locationId || "").trim(),
      idempotencyKey,
      customer: ((body as any).customer || {}) as any,
      requestedPickupAt: (body as any).requestedPickupAt || null,
      tipCents: Number((body as any).tipCents || 0),
      lines: Array.isArray((body as any).lines) ? (body as any).lines : [],
    });
    return onlineOrderingJson({ ok: true, order: result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "online_order_create_failed";
    return onlineOrderingJson({ ok: false, error: message }, { status: onlineOrderingErrorStatus(message) });
  }
}
