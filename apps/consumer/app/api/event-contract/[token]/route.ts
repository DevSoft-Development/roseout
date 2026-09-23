import {
  createLeadPaymentCheckout,
  getLeadContractByToken,
  signLeadContract,
} from "@/lib/leads/commercial";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "sign");

    if (action === "sign") {
      if (body.accepted !== true) {
        return Response.json({ success: false, error: "You must accept the agreement before signing." }, { status: 400 });
      }
      const result = await signLeadContract(token, String(body.signerName || ""), String(body.signerEmail || ""));
      return Response.json({ success: true, lead: result.lead, checkoutUrl: result.checkoutUrl });
    }

    if (action === "pay_deposit") {
      const lead = await getLeadContractByToken(token);
      if (!lead) return Response.json({ success: false, error: "Agreement not found or expired." }, { status: 404 });
      const result = await createLeadPaymentCheckout(lead.id, "deposit", {
        returnToken: token,
        actor: { type: "customer", email: lead.customer_email || null },
      });
      return Response.json({ success: true, checkoutUrl: result.checkoutUrl });
    }

    return Response.json({ success: false, error: "Unsupported agreement action." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Could not process this agreement." },
      { status: 500 },
    );
  }
}
