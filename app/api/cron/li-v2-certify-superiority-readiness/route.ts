import { refreshLocationClassificationV2 } from "@/lib/location-intelligence/v2/classification";
import { refreshLocationReadiness } from "@/lib/location-intelligence/v2/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Protected maintenance action for the already imported, fixed TOH identity. */
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (process.env.PLATFORM_RUNTIME_PROVIDER !== "aws-background" ||
      request.headers.get("x-toh-aws-internal") !== "managed-dispatch" ||
      process.env.LI_V2_SINGLE_LOCATION_BOOTSTRAP_ENABLED !== "true")
    return Response.json({ ok: false, error: "private_aws_only" }, { status: 403 });
  const { confirmation } = await request.json().catch(() => ({ confirmation: "" }));
  if (confirmation !== "superiority-burger-119-avenue-a")
    return Response.json({ ok: false, error: "confirmation_required" }, { status: 400 });
  const locationId = "0f9c90fa-c73a-4d8b-970d-8c51bec9e968";
  const classification = await refreshLocationClassificationV2(locationId);
  const readiness = await refreshLocationReadiness(locationId);
  return Response.json({ ok: true, locationId, readiness, publiclyDiscoverable: classification.publiclyDiscoverable, searchV3RetrievalCertified: false });
}
