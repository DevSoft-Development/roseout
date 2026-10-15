import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { bootstrapSuperiorityBurger } from "@/lib/location-intelligence/v2/single-location-bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

// This administrative dry run uses the existing verified business evidence
// and never stages, publishes or purchases any data.
export async function POST(request: Request) {
  await requireAdminRole(["superadmin"]);
  if (process.env.PLATFORM_RUNTIME_PROVIDER !== "aws-admin") {
    return NextResponse.json({ok:false,error:"aws_admin_runtime_required"},{status:403});
  }
  if (process.env.LI_V2_SINGLE_LOCATION_BOOTSTRAP_ENABLED !== "true") {
    return NextResponse.json({ok:false,error:"bootstrap_not_authorized"},{status:403});
  }
  const body = await request.json().catch(() => ({}));
  if (body?.confirmation !== "superiority-burger-119-avenue-a" || body?.dryRun !== true) {
    return NextResponse.json({ok:false,error:"exact_dry_run_confirmation_required"},{status:400});
  }
  try {
    const result = await bootstrapSuperiorityBurger({dryRun:true});
    return NextResponse.json(result,{status:result.ok?200:422});
  } catch (error) {
    console.error("li_v2_admin_dry_run_failed",error);
    return NextResponse.json({ok:false,error:"bootstrap_dry_run_failed"},{status:500});
  }
}
