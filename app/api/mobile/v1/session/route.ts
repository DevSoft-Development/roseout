import { NextRequest } from "next/server";
import { resolveMobileIdentity } from "@/app/api/mobile/v1/_lib/identity";
import { mobileError, mobileJson } from "@/app/api/mobile/v1/_lib/response";

export async function GET(req: NextRequest) {
  const identity = await resolveMobileIdentity(req);
  if (!identity) {
    return mobileError("mobile_identity_required", "A valid mobile user or guest session is required.", 401);
  }

  return mobileJson({
    ok: true,
    identity: {
      kind: identity.kind,
      userId: identity.userId,
      guestId: identity.guestId,
      authenticated: identity.kind === "user",
    },
  });
}
