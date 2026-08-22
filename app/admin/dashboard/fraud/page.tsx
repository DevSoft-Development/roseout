import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS, canAdmin } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { addFraudCaseNote, applyFraudAction, triageFraudReport, updateFraudCase } from "./actions";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

const recordTypeLabels: Record<string, string> = {
  user: "Customer account",
  location: "Location",
  claim: "Location claim",
  organizer: "Organizer",
  event: "Event",
  experience: "Experience",
  reservation: "Reservation",
  order: "Ticket order",
  payment: "Payment",
  payout: "Payout",
  review: "Review",
  other: "Other",
};

const caseStatusLabels: Record<string, string> = {
  open: "Needs review",
  investigating: "Being reviewed",
  awaiting_evidence: "Waiting for more information",
  actioned: "Action taken",
  appealed: "Appeal received",
  closed: "Closed",
};

const priorityLabels: Record<string, string> = {
  low: "Low",
  medium: "Normal",
  high: "High",
  urgent: "Urgent",
};

const riskBandLabels: Record<string, string> = {
  low: "Low concern",
  guarded: "Watch",
  elevated: "Needs attention",
  high: "High concern",
  critical: "Critical",
};

const restrictionLabels: Record<string, string> = {
  none: "No restrictions",
  limited: "Limited",
  suspended: "Suspended",
  banned: "Banned",
};

const actionLabels: Record<string, string> = {
  monitor: "Keep watching — no restriction",
  require_verification: "Ask for verification",
  hold_publication: "Pause from going public",
  remove_content: "Remove from public view",
  limit_account: "Limit account activity",
  hold_payout: "Hold payout",
  suspend: "Suspend access",
  ban: "Ban account",
  clear: "Clear restrictions",
  restore: "Restore access or content",
};

const categoryLabels: Record<string, string> = {
  payments: "Payments",
  account_takeover: "Account security",
  ownership: "Ownership",
  content_integrity: "Listing accuracy",
  network: "Connected activity",
  identity: "Identity",
  abuse: "Unusual activity",
  account_integrity: "Account activity",
};

const severityLabels: Record<number, string> = {
  1: "Low",
  2: "Moderate",
  3: "Important",
  4: "High",
  5: "Critical",
};

const plainRuleCopy: Record<string, { title: string; description: string }> = {
  payment_dispute: {
    title: "Payment disputed",
    description: "A customer challenged a payment or asked their bank to reverse it.",
  },
  organizer_payout_destination_change: {
    title: "Organizer changed where payouts are sent",
    description: "The organizer changed the account that receives money after a payout account had already been set up.",
  },
  payout_destination_change: {
    title: "Location changed where payouts are sent",
    description: "The location changed the account that receives money after a payout account had already been set up.",
  },
  claim_otp_bruteforce: {
    title: "Too many failed ownership checks",
    description: "Someone entered the wrong one-time verification code several times while trying to claim a business.",
  },
  claim_takeover_attempt: {
    title: "Possible attempt to take over a business listing",
    description: "The claim has repeated failed checks or information that does not match the business.",
  },
  event_ticketing_abuse: {
    title: "Unusual event ticket or payment activity",
    description: "The event has unusual ticket prices, refunds, payment disputes, or payout changes that need review.",
  },
  experience_booking_abuse: {
    title: "Unusual experience booking or payment activity",
    description: "The experience has unusual bookings, refunds, payouts, or completion activity that needs review.",
  },
  user_chargeback_pattern: {
    title: "Repeated payment disputes or failures",
    description: "This customer account has multiple challenged payments, failed payments, or frequent payment-method changes.",
  },
  payout_failure: {
    title: "Payout failed",
    description: "Money could not be sent to the connected payout account or was returned.",
  },
  claim_ip_velocity: {
    title: "Too many claims from the same connection",
    description: "Several business claim attempts came from the same internet connection.",
  },
  location_duplicate: {
    title: "Possible duplicate or fake location",
    description: "The location may be a duplicate, made-up listing, or an attempt to copy another business.",
  },
  location_owner_change: {
    title: "Location owner changed",
    description: "A location that already had an owner was moved to a different owner account.",
  },
  location_ownership_mismatch: {
    title: "Claim information does not match the location",
    description: "The person claiming this location provided information that conflicts with the business details already on file.",
  },
  event_content_deception: {
    title: "Event information may be misleading",
    description: "Important event details such as the venue, date, organizer, tickets, or description may not be accurate.",
  },
  experience_content_deception: {
    title: "Experience information may be misleading",
    description: "Important experience details such as the location, schedule, organizer, capacity, or booking information may not be accurate.",
  },
  linked_bad_actor: {
    title: "Connected to a restricted account",
    description: "This record is connected to another account or business that is suspended, banned, or marked as critical concern.",
  },
  claim_velocity: {
    title: "Too many business claims in a short time",
    description: "The same account or location was involved in several claim attempts close together.",
  },
  location_contact_anomaly: {
    title: "Important location details changed",
    description: "Phone, email, website, payout, or ownership information changed in a way that needs review.",
  },
  ticket_order_velocity: {
    title: "Too many ticket orders in a short time",
    description: "The same customer or contact information was used for several ticket orders close together.",
  },
  user_identity_reuse: {
    title: "Same details used across multiple accounts",
    description: "Contact, device, internet connection, or payment details appear on more than one customer account.",
  },
  claim_contact_mismatch: {
    title: "Claim contact does not match business records",
    description: "The phone or email used to verify the claim does not match the contact information already saved for the business.",
  },
  experience_booking_velocity: {
    title: "Too many experience bookings in a short time",
    description: "The same customer or contact information was used for several experience bookings close together.",
  },
  report_burst: {
    title: "Many reports received in a short time",
    description: "This account, business, listing, or transaction received an unusual number of reports close together.",
  },
  event_material_change: {
    title: "Important event details changed after publishing",
    description: "A published event changed important details such as the venue, time, price, or ticket destination.",
  },
  experience_material_change: {
    title: "Important experience details changed after publishing",
    description: "A published experience changed important details such as the location, price, or booking information.",
  },
  payment_failure_velocity: {
    title: "Many failed payments in a short time",
    description: "Several payment attempts failed close together and should be reviewed for unusual activity.",
  },
  reservation_velocity: {
    title: "Too many reservations in a short time",
    description: "The same contact information was used for several reservations close together.",
  },
  user_velocity: {
    title: "Unusually fast account activity",
    description: "The account completed many sign-ins, reports, reservations, or purchases in a short period.",
  },
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function words(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function recordType(value: string | null | undefined) {
  return value ? recordTypeLabels[value] || words(value) : "Record";
}

function caseStatus(value: string | null | undefined) {
  return value ? caseStatusLabels[value] || words(value) : "Unknown";
}

function priority(value: string | null | undefined) {
  return value ? priorityLabels[value] || words(value) : "Normal";
}

function riskBand(value: string | null | undefined) {
  return value ? riskBandLabels[value] || words(value) : "Unknown";
}

function restriction(value: string | null | undefined) {
  return value ? restrictionLabels[value] || words(value) : "Unknown";
}

function actionLabel(value: string | null | undefined) {
  return value ? actionLabels[value] || words(value) : "Action";
}

function categoryLabel(value: string | null | undefined) {
  return value ? categoryLabels[value] || words(value) : "Unusual activity";
}

function ruleTitle(ruleKey: string | null | undefined, fallback: string | null | undefined) {
  return (ruleKey && plainRuleCopy[ruleKey]?.title) || fallback || "Unusual activity detected";
}

function ruleDescription(ruleKey: string | null | undefined, fallback: string | null | undefined) {
  return (ruleKey && plainRuleCopy[ruleKey]?.description) || fallback || "This activity needs an admin review.";
}

function ruleReviewGuidance(severity: number) {
  if (severity >= 5) return "Review this as soon as possible. Confirm the surrounding account, payment, claim, or listing activity before deciding whether to restrict access or money movement.";
  if (severity === 4) return "Review this promptly and compare it with recent activity. Take action when the surrounding facts support the warning.";
  if (severity === 3) return "Check the surrounding activity and related warning signs. This can be legitimate by itself, so use the full case history before taking action.";
  return "Keep an eye on the activity and review it alongside any other warning signs before taking action.";
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4">
      <p className="text-xs font-black uppercase tracking-[.12em] text-white/40">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      {detail ? <p className="mt-1 text-xs font-semibold leading-5 text-white/45">{detail}</p> : null}
    </div>
  );
}

export default async function FraudPage({ searchParams }: { searchParams: Params }) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.fraud);
  const params = await searchParams;
  const q = (first(params.q) || "").trim();
  const subject = (first(params.subject) || "").trim();
  const view = first(params.view) || "cases";
  const selectedCaseId = first(params.case) || "";

  let casesQuery = supabaseAdmin.from("fraud_cases").select("*").order("last_activity_at", { ascending: false }).limit(100);
  if (subject) casesQuery = casesQuery.eq("primary_subject_type", subject);
  if (q) casesQuery = casesQuery.or(`primary_subject_id.ilike.%${q.replace(/[%,]/g, " ")}%,title.ilike.%${q.replace(/[%,]/g, " ")}%`);

  const [casesResult, subjectsResult, reportsResult, rulesResult, appealsResult] = await Promise.all([
    casesQuery,
    supabaseAdmin.from("fraud_subjects").select("*").order("risk_score", { ascending: false }).limit(100),
    supabaseAdmin.from("fraud_reports").select("*").in("status", ["new", "triaged"]).order("created_at", { ascending: false }).limit(100),
    supabaseAdmin.from("fraud_rules").select("*").eq("enabled", true),
    supabaseAdmin.from("fraud_appeals").select("*").in("status", ["submitted", "under_review"]).order("created_at", { ascending: false }).limit(50),
  ]);

  for (const result of [casesResult, subjectsResult, reportsResult, rulesResult, appealsResult]) {
    if (result.error) throw result.error;
  }

  const cases = casesResult.data || [];
  const subjects = subjectsResult.data || [];
  const reports = reportsResult.data || [];
  const rules = rulesResult.data || [];
  const appeals = appealsResult.data || [];
  const openCases = cases.filter((item) => item.status !== "closed");
  const highRisk = subjects.filter((item) => ["high", "critical"].includes(item.risk_band));
  const restricted = subjects.filter((item) => item.enforcement_state !== "none");

  const selectedCase = selectedCaseId
    ? cases.find((item) => item.id === selectedCaseId) ||
      (await supabaseAdmin.from("fraud_cases").select("*").eq("id", selectedCaseId).maybeSingle()).data
    : null;

  let notes: any[] = [];
  let signals: any[] = [];
  let actions: any[] = [];
  let linkedSubjects: any[] = [];

  if (selectedCase) {
    const details = await Promise.all([
      supabaseAdmin.from("fraud_case_notes").select("*").eq("case_id", selectedCase.id).order("created_at", { ascending: false }),
      supabaseAdmin.from("fraud_signals").select("*").eq("subject_type", selectedCase.primary_subject_type).eq("subject_id", selectedCase.primary_subject_id).order("observed_at", { ascending: false }).limit(100),
      supabaseAdmin.from("fraud_actions").select("*").eq("case_id", selectedCase.id).order("created_at", { ascending: false }),
      supabaseAdmin.from("fraud_case_subjects").select("*").eq("case_id", selectedCase.id),
    ]);
    for (const result of details) if (result.error) throw result.error;
    notes = details[0].data || [];
    signals = details[1].data || [];
    actions = details[2].data || [];
    linkedSubjects = details[3].data || [];
  }

  const canManage = canAdmin(admin.role, "fraudManage");
  const canEnforce = canAdmin(admin.role, "fraudEnforce");

  const tabs = [
    ["cases", "Cases to review"],
    ["reports", "User reports"],
    ["subjects", "People & businesses"],
    ["rules", "Protection checks"],
  ];

  return (
    <main className="min-h-screen bg-[#050607] p-4 text-white sm:p-6">
      <div className="mx-auto max-w-[1650px]">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-[#ff5570]">Fraud & Safety</p>
            <h1 className="mt-2 text-3xl font-black">Review suspicious activity</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-white/50">
              See what needs attention, understand why it was flagged, and decide what to do next. This page uses plain-language guidance so an admin does not need technical fraud knowledge to use it.
            </p>
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Metric label="Needs review" value={openCases.length} detail="Cases that are not finished yet" />
          <Metric label="High concern" value={highRisk.length} detail="Activity that needs closer attention" />
          <Metric label="Restricted" value={restricted.length} detail="Accounts, listings, or payouts currently limited" />
          <Metric label="New reports" value={reports.length} detail="Reports waiting for an admin decision" />
          <Metric label="Appeals waiting" value={appeals.length} detail="People asking us to review a decision" />
          <Metric label="Protection checks" value={rules.length} detail="Automatic checks currently protecting the platform" />
        </section>

        <section className="mt-5 rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:p-5">
          <p className="font-black">What should I do on this page?</p>
          <div className="mt-3 grid gap-3 text-sm font-semibold leading-5 text-white/55 md:grid-cols-4">
            <p><span className="mr-2 font-black text-white">1.</span>Open a case that needs review.</p>
            <p><span className="mr-2 font-black text-white">2.</span>Read why the activity was flagged.</p>
            <p><span className="mr-2 font-black text-white">3.</span>Choose an action only when needed.</p>
            <p><span className="mr-2 font-black text-white">4.</span>Leave a note so the next admin knows what happened.</p>
          </div>
        </section>

        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Fraud and safety sections">
          {tabs.map(([key, label]) => (
            <Link
              key={key}
              href={`/admin/dashboard/fraud?view=${key}`}
              className={`rounded-xl px-4 py-2.5 text-sm font-black ${view === key ? "bg-[#e1062a]" : "border border-white/10 bg-white/[.03]"}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {view === "cases" ? (
          <>
            <form className="mt-5 flex flex-wrap gap-2">
              <input type="hidden" name="view" value="cases" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search by case name or record ID"
                className="min-w-72 flex-1 rounded-xl border border-white/10 bg-black/30 p-3 text-sm font-semibold outline-none"
              />
              <select name="subject" defaultValue={subject} aria-label="Record type" className="rounded-xl border border-white/10 bg-black p-3 text-sm font-bold">
                <option value="">All record types</option>
                {Object.entries(recordTypeLabels).filter(([key]) => key !== "other").map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <button className="rounded-xl bg-[#e1062a] px-5 py-3 text-sm font-black">Search</button>
            </form>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,.78fr)]">
              <section className="space-y-3">
                {cases.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center">
                    <p className="font-black">Nothing needs review here.</p>
                    <p className="mt-1 text-sm font-semibold text-white/45">Try changing your search or record type.</p>
                  </div>
                ) : cases.map((item) => (
                  <Link key={item.id} href={`/admin/dashboard/fraud?view=cases&case=${item.id}`} className="block rounded-2xl border border-white/10 bg-white/[.035] p-5 hover:border-white/25">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[.12em] text-[#ff5570]">Case #{item.case_number} · {recordType(item.primary_subject_type)}</p>
                        <h2 className="mt-1 font-black">{item.title}</h2>
                        <p className="mt-2 text-sm leading-5 text-white/50">{item.summary || "No summary has been added yet."}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-2xl font-black">{item.risk_score}</p>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-white/35">Concern score</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
                      <span className="rounded-full border border-white/10 px-3 py-1">{caseStatus(item.status)}</span>
                      <span className="rounded-full border border-white/10 px-3 py-1">{priority(item.priority)} priority</span>
                    </div>
                  </Link>
                ))}
              </section>

              <aside>
                {selectedCase ? (
                  <div className="sticky top-6 rounded-2xl border border-white/10 bg-[#0a0b0d] p-5">
                    <p className="text-xs font-black uppercase tracking-[.12em] text-[#ff5570]">Case #{selectedCase.case_number}</p>
                    <h2 className="mt-1 text-xl font-black">{selectedCase.title}</h2>
                    <p className="mt-2 text-sm text-white/50">This case is about a <span className="font-black text-white">{recordType(selectedCase.primary_subject_type).toLowerCase()}</span>.</p>
                    <details className="mt-2 text-xs font-semibold text-white/35">
                      <summary className="cursor-pointer">Show record ID</summary>
                      <p className="mt-1 break-all">{selectedCase.primary_subject_id}</p>
                    </details>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Metric label="Concern score" value={selectedCase.risk_score} detail="Higher means more attention is needed" />
                      <Metric label="Warning signs" value={signals.length} detail="Things that caused this case to be flagged" />
                    </div>

                    {canManage ? (
                      <form action={updateFraudCase} className="mt-5 space-y-3 rounded-xl border border-white/10 p-4">
                        <div>
                          <p className="text-sm font-black">Case progress</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-white/40">Update where the review stands and how quickly it needs attention.</p>
                        </div>
                        <input type="hidden" name="caseId" value={selectedCase.id} />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-xs font-bold text-white/50">Status
                            <select name="status" defaultValue={selectedCase.status} className="mt-1 w-full rounded-xl border border-white/10 bg-black p-3 text-sm font-bold text-white">
                              {Object.entries(caseStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                          <label className="text-xs font-bold text-white/50">Priority
                            <select name="priority" defaultValue={selectedCase.priority} className="mt-1 w-full rounded-xl border border-white/10 bg-black p-3 text-sm font-bold text-white">
                              {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </label>
                        </div>
                        <textarea name="resolutionNotes" placeholder="What did you find or decide?" className="min-h-20 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm" />
                        <button className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-black">Save case update</button>
                      </form>
                    ) : null}

                    {canEnforce ? (
                      <form action={applyFraudAction} className="mt-5 space-y-3 border-t border-white/10 pt-5">
                        <input type="hidden" name="caseId" value={selectedCase.id} />
                        <input type="hidden" name="subjectType" value={selectedCase.primary_subject_type} />
                        <input type="hidden" name="subjectId" value={selectedCase.primary_subject_id} />
                        <div>
                          <p className="text-sm font-black">Choose what happens next</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-white/40">Use a restriction only when the information in this case supports it. Some choices can hide content, limit an account, or hold money.</p>
                        </div>
                        <label className="block text-xs font-bold text-white/50">Action
                          <select name="actionType" className="mt-1 w-full rounded-xl border border-white/10 bg-black p-3 text-sm font-bold text-white">
                            {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </label>
                        <input name="reason" required placeholder="Why are you taking this action?" className="w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm" />
                        <label className="block text-xs font-bold text-white/50">End date, if temporary
                          <input name="endsAt" type="datetime-local" className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white" />
                        </label>
                        <button className="w-full rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black">Confirm action</button>
                      </form>
                    ) : null}

                    {canManage ? (
                      <form action={addFraudCaseNote} className="mt-5 space-y-2 border-t border-white/10 pt-5">
                        <p className="text-sm font-black">Add an internal note</p>
                        <p className="text-xs font-semibold text-white/40">Notes are for admins and help explain what was checked or decided.</p>
                        <input type="hidden" name="caseId" value={selectedCase.id} />
                        <textarea name="note" required placeholder="Write a note for the next admin…" className="min-h-20 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm" />
                        <button className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-black">Add note</button>
                      </form>
                    ) : null}

                    <div className="mt-5 space-y-2 border-t border-white/10 pt-5">
                      <div>
                        <p className="text-sm font-black">Why this was flagged</p>
                        <p className="mt-1 text-xs font-semibold text-white/40">A simple history of warning signs, admin actions, and notes.</p>
                      </div>
                      {signals.slice(0, 10).map((signal) => (
                        <div key={signal.id} className="rounded-xl bg-white/[.035] p-3">
                          <p className="text-xs font-black">{ruleTitle(signal.rule_key, words(signal.signal_type))}</p>
                          <p className="mt-1 text-xs leading-5 text-white/45">
                            {categoryLabel(signal.category)} · {severityLabels[Number(signal.severity)] || "Important"} concern · Added {signal.score_delta} points
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-white/30">{new Date(signal.observed_at).toLocaleString()}</p>
                        </div>
                      ))}
                      {actions.slice(0, 8).map((action) => (
                        <div key={action.id} className="rounded-xl border border-[#ff5570]/20 bg-[#ff5570]/5 p-3">
                          <p className="text-xs font-black">Admin action: {actionLabel(action.action_type)}</p>
                          <p className="mt-1 text-xs leading-5 text-white/45">{action.reason}</p>
                        </div>
                      ))}
                      {notes.slice(0, 8).map((note) => (
                        <div key={note.id} className="rounded-xl bg-white/[.035] p-3">
                          <p className="text-xs font-black">Admin note</p>
                          <p className="mt-1 text-xs leading-5 text-white/55">{note.note}</p>
                        </div>
                      ))}
                      {signals.length === 0 && actions.length === 0 && notes.length === 0 ? <p className="py-4 text-center text-xs font-semibold text-white/35">No case history yet.</p> : null}
                    </div>

                    {linkedSubjects.length > 1 ? (
                      <details className="mt-5 border-t border-white/10 pt-5">
                        <summary className="cursor-pointer text-sm font-black">Related records ({linkedSubjects.length})</summary>
                        <p className="mt-1 text-xs font-semibold text-white/40">Other records connected to this same review.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {linkedSubjects.map((link) => <span key={link.id} className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold">{recordType(link.subject_type)}</span>)}
                        </div>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
                    <p className="font-black">Choose a case to review</p>
                    <p className="mt-1 text-sm font-semibold leading-5 text-white/40">The case details, reasons it was flagged, and available actions will appear here.</p>
                  </div>
                )}
              </aside>
            </div>
          </>
        ) : null}

        {view === "reports" ? (
          <section className="mt-5 space-y-3">
            <div className="mb-4">
              <h2 className="text-xl font-black">Reports from users</h2>
              <p className="mt-1 text-sm font-semibold text-white/45">Review concerns people submitted and decide whether they need a case or can be closed.</p>
            </div>
            {reports.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center font-semibold text-white/45">No reports are waiting for review.</div> : reports.map((report) => (
              <article key={report.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[.12em] text-[#ff5570]">{recordType(report.subject_type)}</p>
                    <h2 className="mt-1 font-black">{report.reason}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">{report.details || "The person did not provide any additional details."}</p>
                    <details className="mt-2 text-xs font-semibold text-white/35"><summary className="cursor-pointer">Show record ID</summary><p className="mt-1 break-all">{report.subject_id}</p></details>
                  </div>
                  {canManage ? (
                    <form action={triageFraudReport} className="flex flex-wrap gap-2">
                      <input type="hidden" name="reportId" value={report.id} />
                      <button name="reportAction" value="case" className="rounded-xl bg-[#e1062a] px-4 py-2.5 text-xs font-black">Review as a case</button>
                      <button name="reportAction" value="dismiss" className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black">Close report</button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {view === "subjects" ? (
          <section className="mt-5">
            <div className="mb-4">
              <h2 className="text-xl font-black">People, businesses, and activity being watched</h2>
              <p className="mt-1 text-sm font-semibold text-white/45">This list shows records that have received a concern score. A score is a reason to review—not proof that fraud happened.</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {subjects.map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
                  <p className="text-xs font-black uppercase tracking-[.12em] text-[#ff5570]">{recordType(item.subject_type)}</p>
                  <h2 className="mt-1 break-all font-black">{item.display_label || "Record under review"}</h2>
                  <details className="mt-2 text-xs font-semibold text-white/35"><summary className="cursor-pointer">Show record ID</summary><p className="mt-1 break-all">{item.subject_id}</p></details>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-4xl font-black">{item.risk_score}</p>
                      <p className="text-xs font-bold text-white/40">{riskBand(item.risk_band)}</p>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black">{restriction(item.enforcement_state)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {view === "rules" ? (
          <section className="mt-5">
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/[.025] p-5">
              <h2 className="text-xl font-black">How TheOutHaven detects risky activity</h2>
              <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-white/45">These automatic protection checks look for patterns that may need an admin review. They do not automatically mean a person or business committed fraud.</p>
              <p className="mt-2 text-xs font-semibold text-white/35">Click any protection check to see exactly what it watches, what happens when it triggers, and what an admin should do next.</p>
            </div>
            <div className="grid items-start gap-3 lg:grid-cols-2">
              {rules.map((rule) => {
                const severity = Number(rule.severity);
                return (
                  <details key={rule.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.035] open:border-white/20 open:bg-white/[.05]">
                    <summary className="cursor-pointer list-none p-5">
                      <span className="flex items-start justify-between gap-4">
                        <span>
                          <span className="block text-xs font-black uppercase tracking-[.12em] text-[#ff5570]">{categoryLabel(rule.category)}</span>
                          <span className="mt-1 block font-black">{ruleTitle(rule.rule_key, rule.name)}</span>
                          <span className="mt-2 block text-sm leading-6 text-white/50">{ruleDescription(rule.rule_key, rule.description)}</span>
                          <span className="mt-3 block text-xs font-black text-white/60">Click to view details ↓</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-3xl font-black">+{rule.default_score}</span>
                          <span className="block text-xs font-bold text-white/40">concern points</span>
                          <span className="mt-1 block text-[11px] font-semibold text-white/30">{severityLabels[severity] || "Important"}</span>
                        </span>
                      </span>
                    </summary>

                    <div className="border-t border-white/10 p-5 pt-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-black/25 p-3">
                          <p className="text-[11px] font-black uppercase tracking-[.12em] text-white/35">Applies to</p>
                          <p className="mt-1 text-sm font-black">{recordType(rule.subject_type)}</p>
                        </div>
                        <div className="rounded-xl bg-black/25 p-3">
                          <p className="text-[11px] font-black uppercase tracking-[.12em] text-white/35">Concern level</p>
                          <p className="mt-1 text-sm font-black">{severityLabels[severity] || "Important"}</p>
                        </div>
                        <div className="rounded-xl bg-black/25 p-3">
                          <p className="text-[11px] font-black uppercase tracking-[.12em] text-white/35">Automatic case</p>
                          <p className="mt-1 text-sm font-black">{rule.auto_case ? "Yes" : "No"}</p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-4 text-sm leading-6">
                        <div>
                          <p className="font-black">What this check watches</p>
                          <p className="mt-1 text-white/55">{ruleDescription(rule.rule_key, rule.description)}</p>
                        </div>
                        <div>
                          <p className="font-black">What happens when it triggers</p>
                          <p className="mt-1 text-white/55">
                            It adds {rule.default_score} concern points to the record. {rule.auto_case ? "The system also opens or links a review case so an admin can investigate it." : "The points are combined with other warning signs and may lead to a review case if the overall concern becomes high enough."}
                          </p>
                        </div>
                        <div>
                          <p className="font-black">What the admin should do</p>
                          <p className="mt-1 text-white/55">{ruleReviewGuidance(severity)}</p>
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
