import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { sendGrowthProEmail } from "@/lib/growth-pro/email";
import { createLocationLeadPaymentCheckout } from "@/lib/leads/private-events";
import { buildSiteUrl } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const SELECT = "id,location_id,lead_type,customer_name,customer_email,customer_phone,occasion,event_date,event_time,guest_count,budget_range,food_needs,drink_needs,private_room_needed,package_interest,notes,status,source,created_at,updated_at,proposal_title,proposal_description,proposal_payload,proposal_amount_cents,proposal_currency,proposal_version,proposal_sent_at,proposal_expires_at,contract_terms,contract_status,contract_sent_at,contract_signed_at,contract_signer_name,contract_signer_email,deposit_amount_cents,deposit_status,deposit_checkout_session_id,deposit_paid_at,balance_amount_cents,balance_status,balance_checkout_session_id,balance_paid_at,confirmed_at,completed_at,canceled_at,lost_at,public_token,public_token_expires_at";

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function cents(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}
function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function accessFor(request: Request, locationId: string, permission: "location.view" | "location.edit") {
  return requireLocationPermission({ request, locationId, permission });
}

async function loadLead(locationId: string, leadId: string) {
  const { data, error } = await supabaseAdmin.from("location_leads").select(SELECT).eq("id", leadId).eq("location_id", locationId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Lead not found.");
  return data as Record<string, any>;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const locationId = clean(url.searchParams.get("locationId"), 80);
    if (!locationId) return Response.json({ error: "Location is required." }, { status: 400 });
    const { access, error } = await accessFor(request, locationId, "location.view");
    if (error) return error;
    const canonicalLocationId = access.canonicalLocationId || locationId;
    const { data, error: queryError } = await supabaseAdmin.from("location_leads").select(SELECT).eq("location_id", canonicalLocationId).in("lead_type", ["private_event", "catering"]).order("updated_at", { ascending: false }).limit(250);
    if (queryError) throw queryError;
    return Response.json({ leads: data || [], locationId: canonicalLocationId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load event leads." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const locationId = clean(body.locationId, 80);
    const leadId = clean(body.leadId, 80);
    const action = clean(body.action, 40);
    if (!locationId || !leadId || !action) return Response.json({ error: "Location, lead, and action are required." }, { status: 400 });

    const { access, error } = await accessFor(request, locationId, "location.edit");
    if (error) return error;
    const canonicalLocationId = access.canonicalLocationId || locationId;
    const lead = await loadLead(canonicalLocationId, leadId);
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { updated_at: now };

    if (action === "save_proposal") {
      const total = cents(body.proposalAmountCents);
      const deposit = Math.min(total, cents(body.depositAmountCents));
      update.proposal_title = clean(body.proposalTitle, 180) || "Private event proposal";
      update.proposal_description = clean(body.proposalDescription, 3000) || null;
      update.proposal_payload = object(body.proposalPayload);
      update.proposal_amount_cents = total;
      update.proposal_currency = "usd";
      update.proposal_version = Number(lead.proposal_version || 0) + 1;
      update.proposal_expires_at = clean(body.proposalExpiresAt, 40) || null;
      update.contract_terms = clean(body.contractTerms, 12000) || null;
      update.deposit_amount_cents = deposit;
      update.balance_amount_cents = Math.max(0, total - deposit);
      if (lead.deposit_status !== "paid") update.deposit_status = deposit > 0 ? "pending" : "not_required";
      if (lead.balance_status !== "paid") update.balance_status = total - deposit > 0 ? "pending" : "not_required";
      update.status = "proposal_draft";
    } else if (action === "send_proposal") {
      if (!Number(lead.proposal_amount_cents || 0)) return Response.json({ error: "Save the proposal before sending it." }, { status: 409 });
      update.proposal_sent_at = now;
      update.status = "proposal_sent";
    } else if (action === "send_contract") {
      if (!Number(lead.proposal_amount_cents || 0) || !String(lead.contract_terms || "").trim()) {
        return Response.json({ error: "A priced proposal and contract terms are required." }, { status: 409 });
      }
      update.contract_status = "sent";
      update.contract_sent_at = now;
      update.public_token_expires_at = new Date(Date.now() + 180 * 86400000).toISOString();
      update.status = "contract_sent";
    } else if (action === "complete") {
      if (Number(lead.balance_amount_cents || 0) > 0 && lead.balance_status !== "paid") {
        return Response.json({ error: "Final balance must be paid before completing the event." }, { status: 409 });
      }
      update.status = "completed";
      update.completed_at = now;
    } else if (action === "lost") {
      update.status = "lost";
      update.lost_at = now;
    } else if (action === "cancel") {
      update.status = "canceled";
      update.canceled_at = now;
      update.contract_status = lead.contract_status === "signed" ? "signed" : "void";
    } else {
      return Response.json({ error: "Unsupported lead action." }, { status: 400 });
    }

    const { data, error: updateError } = await supabaseAdmin.from("location_leads").update(update).eq("id", leadId).eq("location_id", canonicalLocationId).select(SELECT).single();
    if (updateError) throw updateError;

    const customerUrl = buildSiteUrl(`/private-events/${data.public_token}`);
    if (action === "send_proposal") {
      await sendGrowthProEmail(data.customer_email, "user_event_proposal_ready", {
        locationName: "TheOutHaven partner location",
        subject: "Your private event proposal is ready",
        heading: "Your private event proposal",
        body: "Review the proposal details and next steps for your event.",
        cta: { label: "Review proposal", url: customerUrl },
      });
    }
    if (action === "send_contract") {
      await sendGrowthProEmail(data.customer_email, "user_event_contract_ready", {
        locationName: "TheOutHaven partner location",
        subject: "Your private event contract is ready",
        heading: "Review and sign your event contract",
        body: "Review the event terms, sign electronically, and complete any required deposit.",
        cta: { label: "Review and sign", url: customerUrl },
      });
    }

    return Response.json({ lead: data, customerUrl });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update event lead." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const locationId = clean(body.locationId, 80);
    const leadId = clean(body.leadId, 80);
    const action = clean(body.action, 40);
    if (!locationId || !leadId) return Response.json({ error: "Location and lead are required." }, { status: 400 });
    const { access, error } = await accessFor(request, locationId, "location.edit");
    if (error) return error;
    const canonicalLocationId = access.canonicalLocationId || locationId;
    await loadLead(canonicalLocationId, leadId);

    if (action !== "payment_link") return Response.json({ error: "Unsupported lead action." }, { status: 400 });
    const kind = body.kind === "balance" ? "balance" : "deposit";
    const result = await createLocationLeadPaymentCheckout({ leadId, kind });
    return Response.json({ checkoutUrl: result.checkoutUrl, alreadyPaid: result.alreadyPaid, kind });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create event payment link." }, { status: 500 });
  }
}
