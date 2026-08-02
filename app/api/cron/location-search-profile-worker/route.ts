import { processProfileRefreshQueue } from "@/lib/search/profile/processProfileRefreshQueue";
import { processProfileRunBatch } from "@/lib/search/profile/profileRunProcessor";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function runWorker(request: Request) {
  const supplied = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || supplied !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workerId = crypto.randomUUID();
    const [refreshQueue, runItems] = await Promise.all([
      processProfileRefreshQueue(`refresh:${workerId}`, 50),
      processProfileRunBatch(`run:${workerId}`, 50),
    ]);

    return NextResponse.json({
      ok: true,
      refreshQueue,
      runItems,
      processed: refreshQueue.processed + runItems.processed,
      succeeded: refreshQueue.succeeded + runItems.succeeded,
      failed: refreshQueue.failed + runItems.failed,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Worker failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return runWorker(request);
}

export async function POST(request: Request) {
  return runWorker(request);
}
