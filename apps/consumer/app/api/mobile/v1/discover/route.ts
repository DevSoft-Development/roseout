import { loadDiscoverSections } from "@/lib/discover";
import { mobileJson } from "@/app/api/mobile/v1/_lib/response";
import { resolveMobileIdentity } from "@/app/api/mobile/v1/_lib/identity";
import { getConsumerHomeGeo } from "@/lib/geo/server";

export async function GET(req: Request) {
  const identity = await resolveMobileIdentity(req as any);
  const geo = identity?.kind === "user" ? await getConsumerHomeGeo(identity.userId) : null;
  const sections = await loadDiscoverSections(geo);
  return mobileJson({ ok: true, sections });
}
