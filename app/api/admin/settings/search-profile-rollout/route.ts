import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  getEffectiveSearchProfileRolloutConfig,
  updateSearchProfileRolloutConfig,
} from "@/lib/search/v2/retrieval/searchProfileRolloutConfig";

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  return NextResponse.json({ config: await getEffectiveSearchProfileRolloutConfig() });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  try {
    const config = await updateSearchProfileRolloutConfig(
      body.config ?? body,
      auth.adminUser!.user_id,
      body.reason,
    );
    return NextResponse.json({ success: true, config });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update search profile rollout." },
      { status: 400 },
    );
  }
}
