import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

const KEYS = ["business-claim-outreach", "business-claim-follow-up", "owner-onboarding", "essentials-conversion"] as const;

export async function getBusinessClaimSequenceMetrics() {
  const { data: sequences, error: sequenceError } = await supabaseAdmin
    .from("crm_sequences")
    .select("id,sequence_key,name,status")
    .in("sequence_key", [...KEYS]);
  if (sequenceError) throw sequenceError;
  const ids = (sequences || []).map((s) => s.id);
  if (!ids.length) return { totals: emptyTotals(), sequences: [], funnel: emptyFunnel(), rates: emptyRates() };

  const [{ data: enrollments, error: enrollmentError }, { data: messages, error: messageError }] = await Promise.all([
    supabaseAdmin.from("crm_sequence_enrollments").select("id,sequence_id,location_id,status,created_at,completed_at,exit_reason").in("sequence_id", ids).order("created_at", { ascending: false }).limit(10000),
    supabaseAdmin.from("crm_messages").select("id,sequence_id,sequence_enrollment_id,status,contact_id,sent_at,delivered_at,opened_at,clicked_at,replied_at").in("sequence_id", ids).eq("direction", "outbound").eq("channel", "email").limit(20000),
  ]);
  if (enrollmentError) throw enrollmentError;
  if (messageError) throw messageError;

  const locationIds = Array.from(new Set((enrollments || []).map((e) => e.location_id).filter(Boolean))) as string[];
  const [gtmEventsResult, locationsResult, contactsResult] = await Promise.all([
    locationIds.length ? supabaseAdmin.from("gtm_events").select("location_id,event_type,occurred_at").in("location_id", locationIds).in("event_type", ["owner_reply", "claim_started", "claim_submitted", "email_unsubscribed"]).limit(20000) : Promise.resolve({ data: [], error: null } as any),
    locationIds.length ? supabaseAdmin.from("locations").select("id,is_claimed,claim_started_at,claim_submitted_at,claim_approved_at,subscription_status,subscription_plan,is_pro,profile_completion_score").in("id", locationIds) : Promise.resolve({ data: [], error: null } as any),
    supabaseAdmin.from("gtm_contact_discoveries").select("location_id,confidence,verification_status,contact_id").eq("contact_kind", "email").gte("confidence", 80).in("verification_status", ["discovered", "verified"]).not("contact_id", "is", null).limit(20000),
  ]);
  if (gtmEventsResult.error) throw gtmEventsResult.error;
  if (locationsResult.error) throw locationsResult.error;
  if (contactsResult.error) throw contactsResult.error;

  const locations = locationsResult.data || [];
  const paid = (l: any) => ["active", "paid"].includes(String(l.subscription_status || "").toLowerCase()) || Boolean(l.is_pro) || !["", "free", "free_discovery"].includes(String(l.subscription_plan || "free").toLowerCase());
  const bySequence = new Map((sequences || []).map((s) => [s.id, { key: s.sequence_key, name: s.name, status: s.status, enrollments: 0, active: 0, completed: 0, exited: 0, sent: 0, delivered: 0, opened: 0, clicked: 0 }]));
  for (const e of enrollments || []) {
    const row = bySequence.get(e.sequence_id); if (!row) continue;
    row.enrollments += 1;
    if (e.status === "active") row.active += 1;
    if (e.status === "completed") row.completed += 1;
    if (e.status === "exited") row.exited += 1;
  }
  for (const m of messages || []) {
    const row = bySequence.get(m.sequence_id); if (!row) continue;
    if (m.sent_at || ["sent", "delivered", "opened", "clicked", "replied"].includes(m.status)) row.sent += 1;
    if (m.delivered_at || ["delivered", "opened", "clicked", "replied"].includes(m.status)) row.delivered += 1;
    if (m.opened_at || ["opened", "clicked", "replied"].includes(m.status)) row.opened += 1;
    if (m.clicked_at || ["clicked", "replied"].includes(m.status)) row.clicked += 1;
  }

  const eventRows = gtmEventsResult.data || [];
  const replyLocations = new Set(eventRows.filter((e: any) => e.event_type === "owner_reply").map((e: any) => e.location_id));
  const contactableLocations = new Set((contactsResult.data || []).map((c: any) => c.location_id));
  const started = locations.filter((l: any) => l.claim_started_at || eventRows.some((e: any) => e.location_id === l.id && e.event_type === "claim_started")).length;
  const submitted = locations.filter((l: any) => l.claim_submitted_at || eventRows.some((e: any) => e.location_id === l.id && e.event_type === "claim_submitted")).length;
  const claimed = locations.filter((l: any) => l.is_claimed || l.claim_approved_at).length;
  const activated = locations.filter((l: any) => (l.is_claimed || l.claim_approved_at) && Number(l.profile_completion_score || 0) >= 70).length;
  const paidCount = locations.filter(paid).length;
  const sentLocationIds = new Set((messages || []).map((m: any) => (enrollments || []).find((e: any) => e.id === m.sequence_enrollment_id)?.location_id).filter(Boolean));
  const totals = {
    contactable: contactableLocations.size,
    enrolled: (enrollments || []).length,
    active: (enrollments || []).filter((e: any) => e.status === "active").length,
    emailsSent: (messages || []).filter((m: any) => m.sent_at || ["sent", "delivered", "opened", "clicked", "replied"].includes(m.status)).length,
    delivered: (messages || []).filter((m: any) => m.delivered_at || ["delivered", "opened", "clicked", "replied"].includes(m.status)).length,
    opened: (messages || []).filter((m: any) => m.opened_at || ["opened", "clicked", "replied"].includes(m.status)).length,
    clicked: (messages || []).filter((m: any) => m.clicked_at || ["clicked", "replied"].includes(m.status)).length,
    replies: replyLocations.size,
    claimStarted: started,
    claimSubmitted: submitted,
    claimed,
    activated,
    paid: paidCount,
  };
  const pct = (num: number, den: number) => den ? Math.round((num / den) * 1000) / 10 : 0;
  return {
    totals,
    sequences: Array.from(bySequence.values()),
    funnel: { contactedLocations: sentLocationIds.size, claimStarted: started, claimSubmitted: submitted, claimed, activated, paid: paidCount },
    rates: { emailToClaim: pct(claimed, sentLocationIds.size), claimToPaid: pct(paidCount, claimed), emailToPaid: pct(paidCount, sentLocationIds.size), clickRate: pct(totals.clicked, totals.delivered), replyRate: pct(totals.replies, sentLocationIds.size) },
  };
}

function emptyTotals() { return { contactable: 0, enrolled: 0, active: 0, emailsSent: 0, delivered: 0, opened: 0, clicked: 0, replies: 0, claimStarted: 0, claimSubmitted: 0, claimed: 0, activated: 0, paid: 0 }; }
function emptyFunnel() { return { contactedLocations: 0, claimStarted: 0, claimSubmitted: 0, claimed: 0, activated: 0, paid: 0 }; }
function emptyRates() { return { emailToClaim: 0, claimToPaid: 0, emailToPaid: 0, clickRate: 0, replyRate: 0 }; }
