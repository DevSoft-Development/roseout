import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  DEFAULT_SEARCH_QA_PROMPTS,
  SEARCH_QA_PROMPT_GROUPS,
} from "@/lib/search/enterprise/qa-prompts";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  return NextResponse.json({
    ok: true,
    prompts: DEFAULT_SEARCH_QA_PROMPTS,
    groups: SEARCH_QA_PROMPT_GROUPS,
  });
}
