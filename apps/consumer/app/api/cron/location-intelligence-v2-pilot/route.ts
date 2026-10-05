import { runLocationIntelligenceV2PilotBatch } from "@/lib/location-intelligence/v2/pilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 280;

function authorized(request: Request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function isPrivateAwsBackgroundRequest(request: Request) {
  return (
    String(process.env.PLATFORM_RUNTIME_PROVIDER || "").trim() === "aws-background" &&
    request.headers.get("x-toh-aws-internal") === "managed-dispatch"
  );
}

async function run(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isPrivateAwsBackgroundRequest(request)) {
    return Response.json(
      {
        ok: false,
        error: "Location Intelligence V2 pilot runs only in the private AWS background runtime.",
      },
      { status: 409 },
    );
  }

  try {
    const pilot = await runLocationIntelligenceV2PilotBatch();
    return Response.json({
      ok: true,
      pilot,
      hasFailures:
        pilot.failed > 0 ||
        pilot.auditFailed > 0 ||
        pilot.postEnrichmentFailed > 0,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Location Intelligence V2 pilot batch failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
