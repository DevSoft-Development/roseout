import { runLocationHoursBackfill } from "@/lib/google/place-hours-backfill";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const header = req.headers.get("x-cron-secret");
  return bearer === secret || header === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const result = await runLocationHoursBackfill({
    limit: body.limit,
    batchSize: body.batchSize,
  });
  return Response.json(result);
}
