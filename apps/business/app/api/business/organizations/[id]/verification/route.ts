import { createClient } from "@/lib/supabase-server";
import {
  getOrganizationTrustState,
  submitOrganizationVerification,
  submitOrganizerVerification,
  upsertOrganizerProfile,
} from "@/lib/organizations/verification";
import { requireOrganizationView } from "@/lib/organizations/access";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await requireOrganizationView(data.user.id, id))) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ success: true, ...(await getOrganizationTrustState(id)) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const action = String(body?.action || "");
    if (action === "save_organizer_profile") {
      const organizerProfile = await upsertOrganizerProfile({
        actorUserId: user.id,
        organizationId: id,
        displayName: String(body.displayName || ""),
        bio: body.bio || null,
        website: body.website || null,
        instagram: body.instagram || null,
        phone: body.phone || null,
      });
      return Response.json({ success: true, organizerProfile });
    }
    if (action === "submit_organization_verification") {
      const request = await submitOrganizationVerification({
        actorUserId: user.id,
        organizationId: id,
        legalName: body.legalName || null,
        website: body.website || null,
        contactEmail: String(body.contactEmail || user.email || ""),
        contactPhone: body.contactPhone || null,
        evidence: typeof body.evidence === "object" && body.evidence ? body.evidence : {},
      });
      return Response.json({ success: true, request });
    }
    if (action === "submit_organizer_verification") {
      const request = await submitOrganizerVerification({
        actorUserId: user.id,
        organizationId: id,
        experienceSummary: body.experienceSummary || null,
        socialLinks: typeof body.socialLinks === "object" && body.socialLinks ? body.socialLinks : {},
        evidence: typeof body.evidence === "object" && body.evidence ? body.evidence : {},
      });
      return Response.json({ success: true, request });
    }
    return Response.json({ error: "Invalid action." }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Unable to update verification." }, { status: 400 });
  }
}
