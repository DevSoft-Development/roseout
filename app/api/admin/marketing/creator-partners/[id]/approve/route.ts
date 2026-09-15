import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { approveCreator } from "@/lib/creator-partners/program";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const form = await request.formData().catch(() => new FormData());
    const tierValue = String(form.get("tier") || "creator_partner");
    const tier = tierValue === "founding_creator" ? "founding_creator" : tierValue === "featured_creator" ? "featured_creator" : "creator_partner";
    await approveCreator(id, tier);
    return NextResponse.redirect(new URL("/admin/dashboard/marketing/creator-partners?approved=1", request.url), 303);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to approve creator." }, { status: 500 });
  }
}
