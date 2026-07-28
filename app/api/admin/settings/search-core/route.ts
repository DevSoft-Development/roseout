import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  getEffectiveSearchCoreConfig,
  updateSearchCoreConfig,
} from "@/lib/search/searchCoreConfig";
export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  return NextResponse.json({ config: await getEffectiveSearchCoreConfig() });
}
export async function PATCH(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  try {
    const config = await updateSearchCoreConfig(
      body.config ?? body,
      auth.adminUser!.user_id,
      body.reason,
    );
    return NextResponse.json({ success: true, config });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update configuration.",
      },
      { status: 400 },
    );
  }
}
