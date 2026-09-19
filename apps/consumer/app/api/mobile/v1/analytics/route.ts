import { NextRequest } from "next/server";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { resolveMobileIdentity } from "../_lib/identity";
import { mobileError, mobileJson } from "../_lib/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, max = 128) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export async function POST(request: NextRequest) {
  const identity = await resolveMobileIdentity(request);
  if (!identity) return mobileError("INVALID_IDENTITY", "Your session could not be verified.", 401);

  const body = await request.json().catch(() => ({}));
  const eventName = text(body?.eventName);
  if (!eventName) return mobileError("EVENT_NAME_REQUIRED", "An analytics event name is required.", 400);

  await trackEvent({
    event_name: eventName,
    canonical_event_name: eventName,
    source: "mobile",
    user_id: identity.kind === "user" ? identity.userId : null,
    anonymous_id: identity.guestId,
    outing_id: text(body?.outingId),
    location_id: text(body?.locationId),
    page_path: text(body?.screen, 256),
    metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
    dedupe_key: text(body?.dedupeKey, 256),
  }).catch(() => undefined);

  return mobileJson({ ok: true });
}
