import { notFound } from "next/navigation";
import { EventContractActions } from "@/components/growth-pro/EventContractActions";
import { getLeadContractByToken } from "@/lib/leads/commercial";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";

function money(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "usd").toUpperCase(),
  }).format(Math.max(0, Number(cents || 0)) / 100);
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function EventContractPage({
  token,
  payment,
}: {
  token: string;
  payment?: string | null;
}) {
  const lead = await getLeadContractByToken(token);
  if (!lead) notFound();

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,address,city,state")
    .eq("id", lead.location_id)
    .maybeSingle();
  if (!location?.id) notFound();

  const contract = object(lead.contract_payload);
  const proposal = object(lead.proposal_payload);
  const terms = String(contract.terms || proposal.terms || "Event details, payment schedule, cancellation terms, and venue policies shown here form the agreement between the customer and venue.");
  const total = Number(lead.quote_total_cents || 0);
  const depositDue = Math.max(0, Number(lead.deposit_required_cents || 0) - Number(lead.deposit_paid_cents || 0));
  const balanceDue = Math.max(0, Number(lead.balance_due_cents || 0) - Number(lead.balance_paid_cents || 0));
  const signed = lead.contract_status === "signed";
  const confirmed = Boolean(lead.confirmed_at) || ["confirmed", "completed"].includes(String(lead.commercial_stage || ""));
  const locationName = getLocationName(location, "Venue");

  return (
    <main className="min-h-screen bg-[#090607] px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-200">TheOutHaven Secure Agreement</p>
        <h1 className="mt-3 text-4xl font-black">{lead.lead_type === "catering" ? "Catering agreement" : "Private event agreement"}</h1>
        <p className="mt-2 text-white/60">{locationName}</p>

        {payment === "success" ? (
          <div className="mt-6 rounded-3xl border border-emerald-300/25 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">
            Payment received. The venue will see the updated payment status automatically.
          </div>
        ) : payment === "cancelled" ? (
          <div className="mt-6 rounded-3xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
            Payment was cancelled. You can return to payment below.
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Event</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-white/50">Customer</dt><dd className="font-bold text-right">{lead.customer_name || "Guest"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-white/50">Occasion</dt><dd className="font-bold text-right">{lead.occasion || "Private event"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-white/50">Date</dt><dd className="font-bold text-right">{lead.event_date || "To be confirmed"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-white/50">Time</dt><dd className="font-bold text-right">{lead.event_time || "To be confirmed"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-white/50">Guests</dt><dd className="font-bold text-right">{lead.guest_count || "TBD"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-white/50">Package</dt><dd className="font-bold text-right">{lead.package_interest || "Custom"}</dd></div>
            </dl>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Commercial terms</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-white/50">Total</dt><dd className="font-bold">{money(total, lead.currency)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-white/50">Deposit</dt><dd className="font-bold">{money(Number(lead.deposit_required_cents || 0), lead.currency)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-white/50">Deposit paid</dt><dd className="font-bold">{money(Number(lead.deposit_paid_cents || 0), lead.currency)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-white/50">Remaining balance</dt><dd className="font-bold">{money(balanceDue, lead.currency)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-white/50">Status</dt><dd className="font-bold capitalize">{confirmed ? "confirmed" : String(lead.commercial_stage || "contract").replace(/_/g, " ")}</dd></div>
            </dl>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-black/25 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Agreement terms</p>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/75">{terms}</p>
        </section>

        <EventContractActions
          token={token}
          signed={signed}
          depositDue={depositDue > 0}
          customerEmail={lead.customer_email || null}
        />

        {signed && balanceDue > 0 ? (
          <p className="mt-4 text-xs text-white/45">
            The final balance will be sent by the venue when it becomes due.
          </p>
        ) : null}
      </div>
    </main>
  );
}
