import { getWebsiteOrderingCatalog } from "@/lib/pos/online-ordering/service";
import { onlineOrderingErrorStatus, onlineOrderingJson, onlineOrderingOptions } from "@/lib/pos/online-ordering/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return onlineOrderingOptions();
}

export async function GET(_: Request, { params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  try {
    const catalog = await getWebsiteOrderingCatalog(String(locationId || "").trim());
    return onlineOrderingJson({ ok: true, catalog }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "online_order_catalog_failed";
    return onlineOrderingJson({ ok: false, error: message }, { status: onlineOrderingErrorStatus(message) });
  }
}
