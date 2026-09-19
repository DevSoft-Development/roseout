import { NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { ensureShortLink } from "@/lib/short-links/service";
import { requireMobileIdentity } from "../_lib/identity";
import { mobileError, mobileJson } from "../_lib/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MobileShareBody = {
  destinationUrl?: string;
  entityType?: "location" | "outing" | "event" | "experience";
  entityId?: string;
  title?: string;
};

export async function POST(request: NextRequest) {
  const identity = await requireMobileIdentity(request);
  if (!identity) return mobileError("UNAUTHORIZED", "A valid mobile session is required.", 401);

  let body: MobileShareBody;
  try {
    body = (await request.json()) as MobileShareBody;
  } catch {
    return mobileError("INVALID_JSON", "Share request was not valid JSON.", 400);
  }

  const destinationUrl = String(body.destinationUrl || "").trim();
  const entityType = body.entityType;
  const entityId = String(body.entityId || "").trim();
  if (!destinationUrl || !entityType || !entityId) {
    return mobileError("SHARE_TARGET_REQUIRED", "A public destination and share target are required.", 400);
  }

  const allowedHosts = new Set(["theouthaven.com", "www.theouthaven.com"]);
  let parsed: URL;
  try {
    parsed = new URL(destinationUrl, "https://theouthaven.com");
  } catch {
    return mobileError("INVALID_DESTINATION", "The share destination is invalid.", 400);
  }

  if (parsed.protocol !== "https:" || !allowedHosts.has(parsed.hostname.toLowerCase())) {
    return mobileError("INVALID_DESTINATION", "Only TheOutHaven public links can be shortened here.", 400);
  }

  try {
    const result = await ensureShortLink(getSupabaseAdminClient(), {
      destinationUrl: parsed.toString(),
      linkType: `mobile_${entityType}_share`,
      entityType,
      entityId,
      title: body.title || null,
      createdBy: identity.kind === "user" ? identity.userId : null,
      metadata: {
        mobile_api_version: 1,
        guest_id: identity.guestId,
      },
    });

    return mobileJson({
      ok: true,
      code: result.code,
      shortUrl: result.shortUrl,
      destinationUrl: result.destinationUrl,
      reused: result.reused,
    });
  } catch {
    return mobileError("SHARE_LINK_FAILED", "TheOutHaven could not create a share link.", 500);
  }
}
