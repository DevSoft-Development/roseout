import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const teamId = String(process.env.IOS_TEAM_ID || "").trim();
  if (!teamId) {
    return NextResponse.json({ error: "App association is not configured" }, { status: 503 });
  }

  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${teamId}.com.theouthaven.app`,
            paths: ["/*"],
          },
        ],
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": "application/json",
      },
    },
  );
}
