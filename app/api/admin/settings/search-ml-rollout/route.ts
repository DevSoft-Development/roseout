import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  getRankingRolloutSettings,
  updateRankingRolloutSettings,
} from "@/lib/search/rankingRollout";

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  return NextResponse.json({ settings: await getRankingRolloutSettings() });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));

  try {
    const settings = await updateRankingRolloutSettings(
      body.settings ?? body,
      auth.adminUser!.user_id,
      body.reason,
    );
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update ML rollout settings.";
    console.error("[search-ml-rollout] update failed", {
      actorId: auth.adminUser!.user_id,
      error,
    });
    return NextResponse.json(
      {
        success: false,
        code: "SEARCH_ML_ROLLOUT_UPDATE_FAILED",
        error: message,
      },
      { status: 400 },
    );
  }
}
