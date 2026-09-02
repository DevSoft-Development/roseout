import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = String(process.env.PLATFORM_RUNTIME_PROVIDER || "web").trim();
  const background = provider === "aws-background";

  let databaseOk = false;
  let databaseError: string | null = null;

  if (background) {
    try {
      const { error } = await supabaseAdmin.from("locations").select("id").limit(1);
      databaseOk = !error;
      databaseError = error ? "virginia_data_api_probe_failed" : null;
    } catch {
      databaseError = "virginia_data_api_probe_failed";
    }
  }

  const ok = background && databaseOk;
  return NextResponse.json(
    {
      ok,
      runtime: provider,
      database: databaseOk ? "ok" : "unavailable",
      ...(databaseError ? { error: databaseError } : {}),
    },
    { status: ok ? 200 : 503 },
  );
}
