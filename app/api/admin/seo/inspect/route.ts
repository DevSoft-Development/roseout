import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { inspectPublicSeoUrl } from "@/lib/admin/seo/live-inspection";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.seoTools);
  if (auth.error) return auth.error;

  try {
    const result = await inspectPublicSeoUrl(new URL(request.url).searchParams.get("url"));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not inspect URL." },
      { status: 400 },
    );
  }
}
