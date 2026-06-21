import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { runLocationHoursBackfill } from "@/lib/google/place-hours-backfill";

export const dynamic = "force-dynamic";

function parseLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const result = await runLocationHoursBackfill({
    limit: parseLimit(body.limit, 25, 100),
    batchSize: parseLimit(body.batchSize, 25, 50),
  });
  return Response.json(result);
}
