import { finalizeWebsitePickupOrder } from "@/lib/pos/online-ordering/service";
import { onlineOrderingErrorStatus, onlineOrderingJson, onlineOrderingOptions } from "@/lib/pos/online-ordering/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return onlineOrderingOptions();
}

export async function POST(_: Request, { params }: { params: Promise<{ locationId: string; onlineOrderId: string }> }) {
  const { locationId, onlineOrderId } = await params;
  try {
    const result = await finalizeWebsitePickupOrder({
      locationId: String(locationId || "").trim(),
      onlineOrderId: String(onlineOrderId || "").trim(),
    });
    return onlineOrderingJson({ ok: true, order: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "online_order_finalize_failed";
    return onlineOrderingJson({ ok: false, error: message }, { status: onlineOrderingErrorStatus(message) });
  }
}
