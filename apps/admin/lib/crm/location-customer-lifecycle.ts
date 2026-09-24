import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const CUSTOMER_LIFECYCLE_STAGES = [
  "unclaimed",
  "outreach",
  "interested",
  "claim_started",
  "claimed",
  "paid",
  "active",
  "renewal",
  "at_risk",
  "churned",
  "win_back",
] as const;

export type CustomerLifecycleStage = (typeof CUSTOMER_LIFECYCLE_STAGES)[number];
export type CustomerHealth = "healthy" | "needs_attention" | "at_risk";

export const CUSTOMER_LIFECYCLE_META: Record<CustomerLifecycleStage, { label: string; helper: string }> = {
  unclaimed: { label: "Unclaimed", helper: "Business has not claimed its profile yet." },
  outreach: { label: "Contacted", helper: "TheOutHaven has started owner outreach." },
  interested: { label: "Interested", helper: "Owner activity shows meaningful interest." },
  claim_started: { label: "Claim in progress", helper: "The owner has started or submitted a claim." },
  claimed: { label: "Claimed", helper: "Ownership is verified and the profile is connected." },
  paid: { label: "Paid customer", helper: "A paid TheOutHaven plan is active." },
  active: { label: "Active customer", helper: "Paid and actively using TheOutHaven." },
  renewal: { label: "Renewal coming up", helper: "The next renewal is approaching." },
  at_risk: { label: "Needs attention", helper: "Billing, engagement, or retention signals need follow-up." },
  churned: { label: "Canceled", helper: "The paid relationship has ended." },
  win_back: { label: "Win back", helper: "The team is actively trying to bring this customer back." },
};

type RawLocation = Record<string, any>;
type RawOpportunity = Record<string, any>;
type RawAccountLink = Record<string, any>;

export type LocationCustomerLifecycleRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  website: string | null;
  ownerEmail: string | null;
  stage: CustomerLifecycleStage;
  stageLabel: string;
  stageHelper: string;
  health: CustomerHealth;
  healthLabel: string;
  planLabel: string;
  billingLabel: string;
  monthlyValueCents: number;
  renewalDate: string | null;
  nextAction: string;
  nextActionDueAt: string | null;
  claimStatus: string;
  opportunityId: string | null;
  opportunityName: string | null;
  opportunityPipeline: string | null;
  accountId: string | null;
  accountName: string | null;
  assignedOwnerId: string | null;
  daysInStage: number | null;
  interestLabel: string;
  churnRisk: number;
  retentionScore: number;
  activity30d: number;
  isPaid: boolean;
  isClaimed: boolean;
  subscriptionStatus: string | null;
  raw: RawLocation;
};

const clean = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => clean(value).toLowerCase().replace(/[\s_]+/g, "-");
const dateValue = (value: unknown) => {
  const v = clean(value);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const daysUntil = (value: unknown) => {
  const date = dateValue(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
};
const daysSince = (value: unknown) => {
  const date = dateValue(value);
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
};
const bool = (value: unknown) => value === true || value === 1 || value === "true";

function locationName(row: RawLocation) {
  return clean(row.name || row.business_name || row.restaurant_name || row.activity_name) || "Unnamed location";
}

function paidPlan(row: RawLocation) {
  const plan = lower(row.subscription_plan || row.plan);
  const status = lower(row.subscription_status || row.plan_status);
  if (bool(row.is_pro)) return true;
  if (["active", "paid", "trialing", "comped"].includes(status) && !["free", "free-discovery", "inactive"].includes(plan)) return true;
  return /essential|partner|reserve|pro|paid/.test(plan) && !["canceled", "cancelled", "inactive"].includes(status);
}

function claimed(row: RawLocation) {
  const status = lower(row.claim_status);
  return bool(row.is_claimed) || bool(row.claimed) || Boolean(row.owner_user_id) || ["claimed", "approved", "verified"].includes(status);
}

function canceled(row: RawLocation) {
  const status = lower(row.subscription_status || row.plan_status);
  return ["canceled", "cancelled", "ended", "expired"].includes(status) || Boolean(row.partner_canceled_at);
}

function outreachStarted(row: RawLocation) {
  return Boolean(
    row.claim_sent_at ||
    row.last_contacted_at ||
    row.claim_last_follow_up_at ||
    clean(row.outreach_status) ||
    clean(row.claim_outreach_status),
  );
}

function ownerInterested(row: RawLocation) {
  return Boolean(
    row.claim_viewed_at ||
    row.claim_started_at ||
    row.claim_submitted_at ||
    row.demo_scheduled_at ||
    row.demo_completed_at ||
    Number(row.engagement_score || 0) >= 35 ||
    Number(row.opportunity_score || 0) >= 60,
  );
}

function claimStarted(row: RawLocation) {
  const status = lower(row.claim_status);
  return Boolean(row.claim_started_at || row.claim_submitted_at) ||
    ["pending", "pending-review", "submitted", "awaiting-review", "needs-review"].includes(status);
}

function recentWinBackActivity(row: RawLocation) {
  if (!canceled(row)) return false;
  const canceledAt = dateValue(row.partner_canceled_at || row.current_period_end);
  const contactedAt = dateValue(row.last_contacted_at || row.claim_last_follow_up_at);
  return Boolean(canceledAt && contactedAt && contactedAt.getTime() > canceledAt.getTime());
}

function atRisk(row: RawLocation) {
  if (!paidPlan(row)) return false;
  const status = lower(row.subscription_status || row.plan_status);
  return Boolean(
    row.past_due_at ||
    row.cancel_at_period_end ||
    ["past-due", "past_due", "unpaid", "incomplete"].includes(status) ||
    Number(row.churn_risk_score || row.churn_risk || 0) >= 60 ||
    (Number(row.retention_score || 0) > 0 && Number(row.retention_score || 0) < 40),
  );
}

function activeUsage(row: RawLocation) {
  return Boolean(
    row.partner_activated_at ||
    Number(row.reservation_completions_30d || 0) > 0 ||
    Number(row.profile_views_30d || 0) >= 10 ||
    Number(row.search_appearances_30d || 0) >= 25 ||
    Number(row.saves_30d || 0) > 0,
  );
}

export function deriveCustomerLifecycleStage(row: RawLocation): CustomerLifecycleStage {
  if (recentWinBackActivity(row)) return "win_back";
  if (canceled(row) && !paidPlan(row)) return "churned";
  if (atRisk(row)) return "at_risk";
  if (paidPlan(row)) {
    const renewalDays = daysUntil(row.current_period_end || row.next_billing_date);
    if (renewalDays != null && renewalDays >= 0 && renewalDays <= 45) return "renewal";
    if (activeUsage(row)) return "active";
    return "paid";
  }
  if (claimed(row)) return "claimed";
  if (claimStarted(row)) return "claim_started";
  if (ownerInterested(row)) return "interested";
  if (outreachStarted(row)) return "outreach";
  return "unclaimed";
}

function healthFor(row: RawLocation, stage: CustomerLifecycleStage): CustomerHealth {
  if (stage === "at_risk" || stage === "churned") return "at_risk";
  if (stage === "renewal" || stage === "win_back" || row.past_due_at || row.cancel_at_period_end) return "needs_attention";
  if (Number(row.churn_risk_score || 0) >= 40) return "needs_attention";
  return "healthy";
}

function planLabel(row: RawLocation) {
  if (canceled(row) && !paidPlan(row)) return "Canceled";
  const plan = clean(row.subscription_plan || row.plan);
  if (paidPlan(row)) {
    if (/essential/i.test(plan)) return "Essentials+";
    if (/reserve/i.test(plan)) return "Reserve";
    if (/partner/i.test(plan)) return "Partner";
    if (/pro/i.test(plan)) return "Paid plan";
    return plan || "Paid plan";
  }
  return claimed(row) ? "Free claimed profile" : "Free listing";
}

function billingLabel(row: RawLocation) {
  if (!paidPlan(row)) return canceled(row) ? "Ended" : "Not started";
  const interval = lower(row.subscription_interval);
  if (interval.includes("year") || interval.includes("annual")) return "Annual";
  if (interval.includes("month")) return "Monthly";
  return "Active";
}

function monthlyValueCents(row: RawLocation) {
  const explicit = Number(row.partner_plan_price_cents || 0);
  if (explicit > 0) {
    const interval = lower(row.subscription_interval);
    return interval.includes("year") || interval.includes("annual") ? Math.round(explicit / 12) : explicit;
  }
  return paidPlan(row) ? 9900 : 0;
}

function interestLabel(row: RawLocation) {
  const score = Number(row.opportunity_score || 0);
  if (score >= 80) return "Strong interest";
  if (score >= 60) return "Good opportunity";
  if (score >= 40) return "Worth watching";
  return outreachStarted(row) ? "Early conversation" : "Not contacted";
}

function activity30d(row: RawLocation) {
  return Number(row.profile_views_30d || 0) +
    Number(row.search_appearances_30d || 0) +
    Number(row.saves_30d || 0) +
    Number(row.reservation_completions_30d || 0);
}

function preferredOpportunity(rows: RawOpportunity[]) {
  const open = rows.find((row) => row.status === "open");
  if (open) return open;
  const renewal = rows.find((row) => row.pipeline_key === "renewal_expansion");
  if (renewal) return renewal;
  return rows[0] || null;
}

function normalizeRow(row: RawLocation, link: RawAccountLink | undefined, opportunities: RawOpportunity[]): LocationCustomerLifecycleRow {
  const stage = deriveCustomerLifecycleStage(row);
  const meta = CUSTOMER_LIFECYCLE_META[stage];
  const health = healthFor(row, stage);
  const opportunity = preferredOpportunity(opportunities);
  const account = link?.crm_accounts || null;
  const stageChangedAt = opportunity?.last_stage_changed_at || row.updated_at || row.created_at;
  return {
    id: String(row.id),
    name: locationName(row),
    address: row.address || null,
    city: row.city || null,
    state: row.state || null,
    zipCode: row.zip_code || row.zip || null,
    phone: row.phone || null,
    website: row.website || null,
    ownerEmail: row.owner_email || row.claimed_by_email || null,
    stage,
    stageLabel: meta.label,
    stageHelper: meta.helper,
    health,
    healthLabel: health === "healthy" ? "Healthy" : health === "needs_attention" ? "Needs attention" : "At risk",
    planLabel: planLabel(row),
    billingLabel: billingLabel(row),
    monthlyValueCents: monthlyValueCents(row),
    renewalDate: row.current_period_end || row.next_billing_date || null,
    nextAction: clean(account?.next_action || row.next_action) || (
      stage === "unclaimed" ? "Contact the owner" :
      stage === "outreach" ? "Follow up with the owner" :
      stage === "interested" ? "Help the owner claim the profile" :
      stage === "claim_started" ? "Help finish the claim" :
      stage === "claimed" ? "Introduce Essentials+" :
      stage === "paid" ? "Complete customer setup" :
      stage === "active" ? "Keep showing customer value" :
      stage === "renewal" ? "Prepare renewal conversation" :
      stage === "at_risk" ? "Start retention follow-up" :
      stage === "churned" ? "Plan a win-back conversation" :
      "Continue win-back follow-up"
    ),
    nextActionDueAt: account?.next_action_at || row.next_action_due_at || null,
    claimStatus: clean(row.claim_status) || (claimed(row) ? "Claimed" : "Unclaimed"),
    opportunityId: opportunity?.id || null,
    opportunityName: opportunity?.name || null,
    opportunityPipeline: opportunity?.pipeline_key || null,
    accountId: link?.account_id || account?.id || null,
    accountName: account?.name || null,
    assignedOwnerId: opportunity?.owner_user_id || null,
    daysInStage: daysSince(stageChangedAt),
    interestLabel: interestLabel(row),
    churnRisk: Number(row.churn_risk_score || row.churn_risk || 0),
    retentionScore: Number(row.retention_score || 0),
    activity30d: activity30d(row),
    isPaid: paidPlan(row),
    isClaimed: claimed(row),
    subscriptionStatus: row.subscription_status || null,
    raw: row,
  };
}

const LOCATION_SELECT = [
  "id",
  "name",
  "business_name",
  "restaurant_name",
  "activity_name",
  "address",
  "city",
  "state",
  "zip_code",
  "phone",
  "website",
  "owner_email",
  "claimed_by_email",
  "claim_status",
  "is_claimed",
  "claimed",
  "owner_user_id",
  "subscription_plan",
  "plan",
  "subscription_status",
  "plan_status",
  "is_pro",
  "partner_canceled_at",
  "claim_sent_at",
  "last_contacted_at",
  "claim_last_follow_up_at",
  "outreach_status",
  "claim_outreach_status",
  "claim_viewed_at",
  "claim_started_at",
  "claim_submitted_at",
  "demo_scheduled_at",
  "demo_completed_at",
  "engagement_score",
  "opportunity_score",
  "past_due_at",
  "cancel_at_period_end",
  "churn_risk_score",
  "churn_risk",
  "retention_score",
  "partner_activated_at",
  "current_period_end",
  "next_billing_date",
  "partner_plan_price_cents",
  "subscription_interval",
  "next_action",
  "next_action_due_at",
  "updated_at",
  "created_at",
].join(",");

function fallbackNextAction(stage: CustomerLifecycleStage) {
  return stage === "unclaimed" ? "Contact the owner" :
    stage === "outreach" ? "Follow up with the owner" :
    stage === "interested" ? "Help the owner claim the profile" :
    stage === "claim_started" ? "Help finish the claim" :
    stage === "claimed" ? "Introduce Essentials+" :
    stage === "paid" ? "Complete customer setup" :
    stage === "active" ? "Keep showing customer value" :
    stage === "renewal" ? "Prepare renewal conversation" :
    stage === "at_risk" ? "Start retention follow-up" :
    stage === "churned" ? "Plan a win-back conversation" :
    "Continue win-back follow-up";
}

async function hydrateLifecycleRows(
  db: ReturnType<typeof getAdminDatabaseClient>,
  inputRows: Record<string, any>[],
): Promise<LocationCustomerLifecycleRow[]> {
  const ids = Array.from(new Set(inputRows.map((row) => String(row.id || "")).filter(Boolean)));
  if (!ids.length) return [];

  const [linksResult, opportunitiesResult] = await Promise.all([
    db
      .from("crm_account_locations")
      .select("location_id,account_id,is_primary_location,crm_accounts(id,name,lifecycle_stage,next_action,next_action_at)")
      .in("location_id", ids)
      .eq("status", "active")
      .limit(Math.min(ids.length * 3, 1000)),
    db
      .from("crm_opportunities")
      .select("id,name,pipeline_key,stage,status,owner_user_id,primary_location_id,last_stage_changed_at,expected_close_date,next_step,next_step_at,amount,monthly_recurring_revenue,annual_recurring_revenue")
      .in("primary_location_id", ids)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(Math.min(ids.length * 5, 2000)),
  ]);

  if (linksResult.error) throw linksResult.error;
  if (opportunitiesResult.error) throw opportunitiesResult.error;

  const links = new Map<string, RawAccountLink>();
  for (const link of linksResult.data || []) {
    if (!link.location_id) continue;
    const key = String(link.location_id);
    const current = links.get(key);
    if (!current || link.is_primary_location) links.set(key, link);
  }

  const opportunities = new Map<string, RawOpportunity[]>();
  for (const opportunity of opportunitiesResult.data || []) {
    if (!opportunity.primary_location_id) continue;
    const key = String(opportunity.primary_location_id);
    const bucket = opportunities.get(key) || [];
    bucket.push(opportunity);
    opportunities.set(key, bucket);
  }

  return inputRows.map((base) => {
    const stage = base.stage as CustomerLifecycleStage;
    const meta = CUSTOMER_LIFECYCLE_META[stage] || CUSTOMER_LIFECYCLE_META.unclaimed;
    const health = (base.health || "healthy") as CustomerHealth;
    const link = links.get(String(base.id));
    const account = link?.crm_accounts || null;
    const opportunity = preferredOpportunity(opportunities.get(String(base.id)) || []);
    const stageChangedAt = opportunity?.last_stage_changed_at || base.stageChangedAt || base.raw?.updated_at;

    return {
      id: String(base.id),
      name: base.name || "Unnamed location",
      address: base.address || null,
      city: base.city || null,
      state: base.state || null,
      zipCode: base.zipCode || null,
      phone: base.phone || null,
      website: base.website || null,
      ownerEmail: base.ownerEmail || null,
      stage,
      stageLabel: meta.label,
      stageHelper: meta.helper,
      health,
      healthLabel: health === "healthy" ? "Healthy" : health === "needs_attention" ? "Needs attention" : "At risk",
      planLabel: base.planLabel || "Free listing",
      billingLabel: base.billingLabel || "Not started",
      monthlyValueCents: Number(base.monthlyValueCents || 0),
      renewalDate: base.renewalDate || null,
      nextAction: clean(account?.next_action || base.nextAction) || fallbackNextAction(stage),
      nextActionDueAt: account?.next_action_at || base.nextActionDueAt || null,
      claimStatus: base.claimStatus || "Unclaimed",
      opportunityId: opportunity?.id || null,
      opportunityName: opportunity?.name || null,
      opportunityPipeline: opportunity?.pipeline_key || null,
      accountId: link?.account_id || account?.id || null,
      accountName: account?.name || null,
      assignedOwnerId: opportunity?.owner_user_id || null,
      daysInStage: daysSince(stageChangedAt),
      interestLabel: base.interestLabel || "Not contacted",
      churnRisk: Number(base.churnRisk || 0),
      retentionScore: Number(base.retentionScore || 0),
      activity30d: Number(base.activity30d || 0),
      isPaid: Boolean(base.isPaid),
      isClaimed: Boolean(base.isClaimed),
      subscriptionStatus: base.subscriptionStatus || null,
      raw: base.raw || {},
    };
  });
}

export async function listLocationCustomerLifecycle(input: {
  q?: string;
  stage?: string;
  health?: string;
  page?: number;
  pageSize?: number;
  permittedLocationIds?: string[] | null;
  summaryOnly?: boolean;
} = {}) {
  const db = getAdminDatabaseClient();
  const page = Math.max(1, Number(input.page || 1));
  const pageSize = [25, 50, 100].includes(Number(input.pageSize)) ? Number(input.pageSize) : 50;
  const summaryOnly = Boolean(input.summaryOnly);

  const { data, error } = await (db as any).rpc("admin_location_customer_lifecycle_page", {
    p_query: clean(input.q) || null,
    p_stage: input.stage && input.stage !== "all" ? input.stage : null,
    p_health: input.health && input.health !== "all" ? input.health : null,
    p_page: page,
    p_page_size: pageSize,
    p_permitted_location_ids: Array.isArray(input.permittedLocationIds) ? input.permittedLocationIds : null,
    p_include_rows: !summaryOnly,
    p_include_board: !summaryOnly,
  });

  if (error) throw error;

  const payload = (data || {}) as Record<string, any>;
  if (summaryOnly) {
    return {
      rows: [] as LocationCustomerLifecycleRow[],
      boardRows: [] as LocationCustomerLifecycleRow[],
      total: Number(payload.total || 0),
      page: Number(payload.page || page),
      pageSize: Number(payload.pageSize || pageSize),
      totalPages: Number(payload.totalPages || 1),
      stageCounts: payload.stageCounts || Object.fromEntries(CUSTOMER_LIFECYCLE_STAGES.map((stage) => [stage, 0])),
      totals: payload.totals || {
        total: 0,
        unclaimed: 0,
        inConversation: 0,
        claimed: 0,
        paid: 0,
        renewals: 0,
        atRisk: 0,
        churned: 0,
        winBack: 0,
        mrrCents: 0,
      },
    };
  }

  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
  const rawBoardRows = Array.isArray(payload.boardRows) ? payload.boardRows : [];
  const uniqueRows = new Map<string, Record<string, any>>();
  for (const row of [...rawRows, ...rawBoardRows]) uniqueRows.set(String(row.id), row);
  const hydrated = await hydrateLifecycleRows(db, Array.from(uniqueRows.values()));
  const hydratedById = new Map(hydrated.map((row) => [row.id, row]));

  return {
    rows: rawRows.map((row: any) => hydratedById.get(String(row.id))).filter(Boolean) as LocationCustomerLifecycleRow[],
    boardRows: rawBoardRows.map((row: any) => hydratedById.get(String(row.id))).filter(Boolean) as LocationCustomerLifecycleRow[],
    total: Number(payload.total || 0),
    page: Number(payload.page || page),
    pageSize: Number(payload.pageSize || pageSize),
    totalPages: Number(payload.totalPages || 1),
    stageCounts: payload.stageCounts || Object.fromEntries(CUSTOMER_LIFECYCLE_STAGES.map((stage) => [stage, 0])),
    totals: payload.totals || {
      total: 0,
      unclaimed: 0,
      inConversation: 0,
      claimed: 0,
      paid: 0,
      renewals: 0,
      atRisk: 0,
      churned: 0,
      winBack: 0,
      mrrCents: 0,
    },
  };
}

export async function getLocationCustomerLifecycleDetail(locationId: string) {
  const db = getAdminDatabaseClient();
  const location = await db.from("locations").select(LOCATION_SELECT).eq("id", locationId).maybeSingle();
  if (location.error) throw location.error;
  if (!location.data) return null;

  const [linkResult, opportunitiesResult, tasksResult, activitiesResult] = await Promise.all([
    db.from("crm_account_locations").select("location_id,account_id,is_primary_location,crm_accounts(id,name,lifecycle_stage,next_action,next_action_at,primary_contact_id)").eq("location_id", locationId).eq("status", "active").order("is_primary_location", { ascending: false }).limit(1).maybeSingle(),
    db.from("crm_opportunities").select("*").eq("primary_location_id", locationId).is("archived_at", null).order("updated_at", { ascending: false }).limit(100),
    db.from("crm_tasks").select("*").eq("location_id", locationId).is("archived_at", null).order("due_at", { ascending: true, nullsFirst: false }).limit(100),
    db.from("crm_activities").select("*").eq("location_id", locationId).order("occurred_at", { ascending: false }).limit(150),
  ]);

  if (linkResult.error) throw linkResult.error;
  if (opportunitiesResult.error) throw opportunitiesResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (activitiesResult.error) throw activitiesResult.error;

  const row = normalizeRow(location.data, linkResult.data || undefined, opportunitiesResult.data || []);
  return {
    row,
    opportunities: opportunitiesResult.data || [],
    tasks: tasksResult.data || [],
    activities: activitiesResult.data || [],
  };
}
