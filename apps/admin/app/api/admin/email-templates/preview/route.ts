import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { POST as previewPost } from "../../email/templates/preview/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.emailTemplates);
  if (error) return error;
  return previewPost(request);
}
