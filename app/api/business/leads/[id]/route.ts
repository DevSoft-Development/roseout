import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import {
  completeLead,
  getLeadById,
  issueLeadContract,
  loseLead,
  saveLeadCommercialPlan,
  sendLeadBalancePaymentLink,
  sendLeadProposal,
} from "@/lib/leads/commercial";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await getLeadById(id);
    if (!lead) return Response.json({ success: false, error: "Lead not found." }, { status: 404 });

    const { access, error } = await requireLocationPermission({
      request,
      locationId: String(lead.location_id),
      permission: "location.edit",
      allowDemoPreview: true,
    });
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").trim();
    const actor = {
      userId: access.userId || null,
      email: access.userEmail || null,
      type: access.isAdmin ? "admin" as const : "business" as const,
    };

    if (action === "save_proposal") {
      const saved = await saveLeadCommercialPlan(id, body, actor);
      return Response.json({ success: true, lead: saved });
    }
    if (action === "send_proposal") {
      const sent = await sendLeadProposal(id, actor);
      return Response.json({ success: true, lead: sent });
    }
    if (action === "send_contract") {
      const result = await issueLeadContract(id, actor);
      return Response.json({ success: true, lead: result.lead, signUrl: result.signUrl });
    }
    if (action === "send_balance_link") {
      const result = await sendLeadBalancePaymentLink(id, actor);
      return Response.json({ success: true, lead: result.lead, checkoutUrl: result.checkoutUrl });
    }
    if (action === "complete") {
      const completed = await completeLead(id, actor);
      return Response.json({ success: true, lead: completed });
    }
    if (action === "lost") {
      const lost = await loseLead(id, actor);
      return Response.json({ success: true, lead: lost });
    }

    return Response.json({ success: false, error: "Unsupported lead action." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Could not update event lead." },
      { status: 500 },
    );
  }
}
