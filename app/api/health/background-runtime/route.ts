import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = String(process.env.PLATFORM_RUNTIME_PROVIDER || "web").trim();
  const background = provider === "aws-background";
  return NextResponse.json(
    { ok: background, runtime: provider },
    { status: background ? 200 : 503 },
  );
}
