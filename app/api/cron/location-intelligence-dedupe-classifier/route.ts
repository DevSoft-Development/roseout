import { processConservativeDedupeClassifier } from "@/lib/location-intelligence/dedupeClassifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function isPrivateAwsBackgroundRequest(request: Request) {
  const provider = String(process.env.PLATFORM_RUNTIME_PROVIDER || "").trim();
  const internal = request.headers.get("x-toh-aws-internal");
  return provider === "aws-background" && internal === "managed-dispatch";
}

function requestedLimit(request: Request) {
  const raw = new URL(request.url).searchParams.get("limit");
  const parsed = Number(raw || 25);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(50, Math.trunc(parsed))) : 25;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isPrivateAwsBackgroundRequest(request)) {
    return Response.json(
      {
        ok: false,
        error: "Location Intelligence dedupe classification executes only in the private AWS background runtime.",
      },
      { status: 409 },
    );
  }

  try {
    const result = await processConservativeDedupeClassifier(requestedLimit(request));
    return Response.json(result, { status: result.failed > 0 ? 207 : 200 });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Location Intelligence dedupe classification failed",
      },
      { status: 500 },
    );
  }
}
