import { createClient } from "@/lib/supabase-server";
import { submitLocationClaim } from "@/lib/locations/claims";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const result = await submitLocationClaim({
      token: body.token,
      businessName: body.businessName || body.location_name,
      contactName: body.contactName || body.owner_name,
      email: body.email || body.owner_email,
      phone: body.phone || body.owner_phone,
      role: body.role || body.role_at_business,
      notes: body.notes || body.message,
      source: body.source || "claim",
      userId: user?.id || null,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status || 400 });
    return Response.json({ success: true, message: "Claim submitted.", claimId: result.claimId, status: result.status, target: result.target });
  } catch (error: any) {
    return Response.json({ error: error.message || "Server error" }, { status: 500 });
  }
}
