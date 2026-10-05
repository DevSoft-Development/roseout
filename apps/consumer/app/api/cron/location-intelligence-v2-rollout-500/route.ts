import { runLocationIntelligenceV2Rollout500Batch } from "@/lib/location-intelligence/v2/rollout-500";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
        error: "Location Intelligence V2 rollout runs only in the private AWS background runtime.",
      },
      { status: 409 },
    );
  }

  try {
    const rollout = await runLocationIntelligenceV2Rollout500Batch();
    return Response.json({
      ok: true,
      rollout,
      hasFailures: rollout.failed > 0,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Location Intelligence V2 rollout batch failed",
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
