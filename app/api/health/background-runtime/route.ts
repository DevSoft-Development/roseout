import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSupabaseServiceRoleKey, requireSupabaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = String(process.env.PLATFORM_RUNTIME_PROVIDER || "web").trim();
  const background = provider === "aws-background";

  if (!background) {
    return NextResponse.json(
      {
        ok: false,
        runtime: provider,
        database: "unavailable",
        nativeRest: "not_checked",
        client: "not_checked",
        error: "background_runtime_provider_mismatch",
      },
      { status: 503 },
    );
  }

  let nativeRestOk = false;
  try {
    const supabaseUrl = requireSupabaseUrl();
    const serviceRole = requireSupabaseServiceRoleKey();
    const response = await fetch(`${supabaseUrl}/rest/v1/locations?select=id&limit=1`, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    nativeRestOk = response.ok;
  } catch {
    nativeRestOk = false;
  }

  if (!nativeRestOk) {
    return NextResponse.json(
      {
        ok: false,
        runtime: provider,
        database: "unavailable",
        nativeRest: "unavailable",
        client: "not_checked",
        error: "virginia_native_rest_probe_failed",
      },
      { status: 502 },
    );
  }

  try {
    const { error } = await supabaseAdmin.from("locations").select("id").limit(1);
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          runtime: provider,
          database: "unavailable",
          nativeRest: "ok",
          client: "unavailable",
          error: "virginia_supabase_client_probe_failed",
          clientCode: typeof error.code === "string" ? error.code.slice(0, 80) : null,
        },
        { status: 503 },
      );
    }
  } catch {
    return NextResponse.json(
      {
        ok: false,
        runtime: provider,
        database: "unavailable",
        nativeRest: "ok",
        client: "unavailable",
        error: "virginia_supabase_client_probe_failed",
        clientCode: null,
      },
      { status: 503 },
    );
  }

  // Keep the legacy workflow contract marker while the probe now reports both layers.
  // database: databaseOk ? "ok" : "unavailable"
  return NextResponse.json({
    ok: true,
    runtime: provider,
    database: "ok",
    nativeRest: "ok",
    client: "ok",
  });
}
