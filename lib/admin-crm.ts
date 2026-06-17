import {
  formatFullAddress as sharedFormatFullAddress,
  stripCityStateZipFromAddress,
} from "@/lib/address-utils";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { inferMarketFromCityStateCounty, type MarketKey } from "@/lib/location-markets";
import { validatePlaceForMarket } from "@/lib/location-market-validation";

export type CRMStatus =
  | "New Lead"
  | "Needs Outreach"
  | "Contacted"
  | "Follow Up"
  | "Upgrade Opportunity"
  | "Active Free"
  | "Active Pro"
  | "At Risk"
  | "Churned"
  | "Unclaimed"
  | "Claimed"
  | "Pro"
  | "Enterprise";

export type BusinessCRMFilter =
  | "all"
  | "upgrade-opportunities"
  | "at-risk"
  | "pending-claims"
  | "owner-accounts"
  | "location-tasks"
  | "follow-ups"
  | "qr-codes"
  | "partner-launch"
  | "launch-pilot"
  | "claim-not-sent"
  | "claim-sent"
  | "claim-started"
  | "claim-approved"
  | "payment-pending"
  | "active-partners"
  | "reservation-ready"
  | "embed-needed"
  | "embed-sent"
  | "embed-installed"
  | "discovery-needed"
  | "follow-ups-due"
  | "owner-contact-missing"
  | "market-issues";

export type PartnerSalesStatus = "target" | "needs_outreach" | "contacted" | "interested" | "claim_link_sent" | "claim_pending" | "claim_approved" | "demo_setup" | "payment_pending" | "active_partner" | "reservation_ready" | "at_risk" | "not_interested" | "churned";
export type ClaimOutreachStatus = "not_sent" | "sent" | "viewed" | "started" | "submitted" | "approved" | "rejected" | "expired";
export type ReservationPortalStatus = "not_enabled" | "needs_setup" | "enabled" | "tested" | "live" | "paused" | "issue";
export type ReservationEmbedStatus = "not_sent" | "generated" | "sent" | "installed" | "tested" | "needs_help" | "not_needed";
export type DiscoveryProfileStatus = "needs_review" | "needs_photos" | "needs_tags" | "needs_hours" | "ready" | "paused" | "issue";

export type PendingCRMClaim = {
  id: string;
  source_table: string;
  location_id?: string | null;
  submitted_business_name?: string | null;
  claimant_name?: string | null;
  claimant_email?: string | null;
  claimant_phone?: string | null;
  status: string;
  submitted_at?: string | null;
  review_notes?: string | null;
};

export type BusinessCRMRow = {
  id: string;
  location_id?: string | null;
  name: string;
  location_name?: string | null;
  address?: string | null;
  city: string | null;
  borough?: string | null;
  state: string | null;
  zip?: string | null;
  zip_code?: string | null;
  phone?: string | null;
  website?: string | null;
  category?: string | null;
  primary_category?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  description?: string | null;
  status?: string | null;
  active?: boolean | null;
  is_searchable?: boolean | null;
  is_claimed: boolean | null;
  reservation_url: string | null;
  reservation_link?: string | null;
  booking_url?: string | null;
  external_reservation_url?: string | null;
  best_reservation_url?: string | null;
  image_url?: string | null;
  main_image?: string | null;
  gallery?: unknown;
  photos?: unknown;
  image_gallery?: unknown;
  gallery_images?: unknown;
  images?: unknown;
  claim_code?: string | null;
  claim_url?: string | null;
  claim_qr_url?: string | null;
  qr_link?: string | null;
  qr_code_data_url?: string | null;
  location_type?: "restaurants" | "activities" | null;
  market?: string | null;
  region?: string | null;
  county?: string | null;
  google_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  owner_user_id?: string | null;
  owner_email?: string | null;
  claim_status?: string | null;
  owner_status?: string | null;
  plan?: string | null;
  plan_status?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  promo_code?: string | null;
  promo_campaign?: string | null;
  billing_notes?: string | null;
  is_pro?: boolean | null;
  pipeline_stage?: string | null;
  outreach_status?: string | null;
  follow_up_date?: string | null;
  crm_priority?: string | null;
  last_contacted_at?: string | null;
  assigned_admin?: string | null;
  priority_level?: string | null;
  tags?: string[] | string | null;
  primary_tag?: string | null;
  vibe_tags?: string[] | string | null;
  mood_tags?: string[] | string | null;
  best_for_tags?: string[] | string | null;
  date_style_tags?: string[] | string | null;
  cuisine_tags?: string[] | string | null;
  search_keywords?: string[] | string | null;
  review_keywords?: string[] | string | null;
  semantic_tags?: string[] | string | null;
  intent_tags?: string[] | string | null;
  special_features?: string[] | string | null;
  price_range?: string | null;
  price_level?: string | number | null;
  dress_code?: string | null;
  hours?: string | null;
  hours_of_operation?: string | null;
  operating_hours?: unknown;
  special_hours?: unknown;
  reservation_enabled?: boolean | null;
  reservation_type?: string | null;
  reservation_source?: string | null;
  internal_reservations_enabled?: boolean | null;
  uses_internal_reservations?: boolean | null;
  instagram_url?: string | null;
  internal_notes?: string | null;
  crm_status: CRMStatus;
  opportunity_score: number;
  upgrade_score?: number;
  upgrade_probability: number;
  engagement_score: number;
  traffic_score: number;
  conversion_score: number;
  retention_score: number;
  churn_risk_score: number;
  churn_risk?: number;
  trending_score: number;
  profile_quality_score?: number;
  seo_score?: number;
  reservation_readiness_score?: number;
  open_tasks?: number;
  open_support_tickets?: number;
  pending_claims?: number;
  qr_scans_30d?: number;
  call_clicks_30d?: number;
  website_clicks_30d?: number;
  reservation_completions_30d: number;
  profile_views_30d: number;
  search_appearances_30d: number;
  saves_30d: number;
  conversion_rate_30d: number;
  created_at?: string | null;
  updated_at?: string | null;
  sales_campaign?: string | null;
  sales_campaign_stage?: string | null;
  partner_launch_selected?: boolean | null;
  partner_launch_pilot?: boolean | null;
  launch_partner_position?: number | null;
  claim_outreach_status?: ClaimOutreachStatus | string | null;
  claim_outreach_channel?: string | null;
  claim_sent_at?: string | null;
  claim_viewed_at?: string | null;
  claim_started_at?: string | null;
  claim_submitted_at?: string | null;
  claim_approved_at?: string | null;
  claim_last_follow_up_at?: string | null;
  claim_outreach_notes?: string | null;
  partner_sales_status?: PartnerSalesStatus | string | null;
  next_action?: string | null;
  next_action_type?: string | null;
  next_action_due_at?: string | null;
  payment_link_sent_at?: string | null;
  demo_scheduled_at?: string | null;
  demo_completed_at?: string | null;
  owner_objection?: string | null;
  lost_reason?: string | null;
  sales_notes?: string | null;
  partner_plan_name?: string | null;
  partner_plan_price_cents?: number | null;
  partner_activated_at?: string | null;
  partner_canceled_at?: string | null;
  reservation_portal_status?: ReservationPortalStatus | string | null;
  reservation_portal_enabled_at?: string | null;
  reservation_portal_tested_at?: string | null;
  reservation_portal_notes?: string | null;
  reservation_portal_url?: string | null;
  reservation_embed_status?: ReservationEmbedStatus | string | null;
  reservation_embed_code_generated_at?: string | null;
  reservation_embed_sent_at?: string | null;
  reservation_embed_installed_at?: string | null;
  reservation_embed_tested_at?: string | null;
  reservation_embed_install_url?: string | null;
  reservation_embed_notes?: string | null;
  discovery_profile_status?: DiscoveryProfileStatus | string | null;
  discovery_profile_ready_at?: string | null;
  discovery_profile_notes?: string | null;
  partner_setup_checklist?: Record<string, any> | null;
  partner_setup_score?: number | null;
  reservation_portal_readiness_score?: number | null;
  embed_readiness_score?: number | null;
  discovery_readiness_score?: number | null;
  sales_readiness_score?: number | null;
  owner_contact_missing?: boolean | null;
  owner_instagram?: string | null;
  webmaster_email?: string | null;
  webmaster_phone?: string | null;
};

export type BusinessCRMSummary = {
  total: number;
  searchable: number;
  claimed: number;
  unclaimed: number;
  pendingClaims: number;
  upgradeCandidates: number;
  upgradeOpportunitiesCount: number;
  atRiskCount: number;
  pendingClaimsCount: number;
  atRisk: number;
  openTasks: number;
  reservationIntent: number;
  searchAppearances: number;
  followUps: number;
  qrCodes: number;
  notSearchable: number; missingCoordinates: number; missingPhotos: number; missingGooglePlaceId: number; restaurants: number; activities: number; marketCounts: Partial<Record<MarketKey, number>>;
  partnerLaunchTotal: number; launchPilotTotal: number; claimNotSent: number; claimSent: number; claimStarted: number; claimApproved: number; paymentPending: number; activePartners: number; reservationReady: number; embedNeeded: number; embedSent: number; embedInstalled: number; discoveryNeeded: number; ownerContactMissing: number; followUpsDueToday: number; mrrCents: number;
};

const CRM_SELECT = "*";

type CRMSourceName =
  | "admin_crm_locations_view"
  | "business_crm_snapshot"
  | "locations";

export type CRMSourceConfig = {
  name: CRMSourceName;
  searchableFields: string[];
  filterFields: string[];
  orderFields: string[];
};

const ALL_CRM_SEARCH_FIELDS = [
  "location_name",
  "name",
  "restaurant_name",
  "activity_name",
  "business_name",
  "phone",
  "phone_number",
  "email",
  "owner_email",
  "claimed_email",
  "claim_code",
  "address",
  "city",
  "borough",
  "state",
  "zip_code",
  "neighborhood",
  "primary_category",
  "category",
  "cuisine",
  "cuisine_type",
  "location_type",
  "market",
  "region",
  "county",
];

export const CRM_SOURCE_CONFIGS: CRMSourceConfig[] = [
  {
    name: "admin_crm_locations_view",
    searchableFields: ALL_CRM_SEARCH_FIELDS,
    filterFields: [
      "owner_user_id",
      "owner_email",
      "is_claimed",
      "open_tasks",
      "follow_up_date",
      "claim_qr_url",
      "qr_link",
      "qr_code_data_url",
      "claim_code",
      "claim_url",
      "opportunity_score",
      "upgrade_score",
      "search_appearances_30d",
      "profile_views_30d",
      "reservation_completions_30d",
      "crm_status",
      "churn_risk_score",
      "churn_risk",
      "active",
      "is_searchable",
      "plan_status",
      "subscription_status",
      "sales_campaign", "partner_launch_selected", "partner_launch_pilot", "claim_outreach_status",
      "partner_sales_status", "next_action_due_at", "reservation_portal_status", "reservation_embed_status",
      "discovery_profile_status", "partner_activated_at", "owner_contact_missing", "market", "county", "city", "state",
    ],
    orderFields: ["updated_at", "created_at", "name"],
  },
  {
    name: "business_crm_snapshot",
    searchableFields: ALL_CRM_SEARCH_FIELDS,
    filterFields: [
      "owner_user_id",
      "owner_email",
      "is_claimed",
      "open_tasks",
      "follow_up_date",
      "claim_qr_url",
      "qr_link",
      "qr_code_data_url",
      "claim_code",
      "claim_url",
      "opportunity_score",
      "upgrade_score",
      "search_appearances_30d",
      "profile_views_30d",
      "reservation_completions_30d",
      "crm_status",
      "churn_risk_score",
      "churn_risk",
      "active",
      "is_searchable",
      "plan_status",
      "subscription_status",
      "sales_campaign", "partner_launch_selected", "partner_launch_pilot", "claim_outreach_status",
      "partner_sales_status", "next_action_due_at", "reservation_portal_status", "reservation_embed_status",
      "discovery_profile_status", "partner_activated_at", "owner_contact_missing", "market", "county", "city", "state",
    ],
    orderFields: ["updated_at", "created_at", "name"],
  },
  {
    name: "locations",
    searchableFields: [
      "name",
      "restaurant_name",
      "activity_name",
      "business_name",
      "phone",
      "phone_number",
      "email",
      "owner_email",
      "claimed_email",
      "claim_code",
      "address",
      "city",
      "borough",
      "state",
      "zip_code",
      "neighborhood",
      "primary_category",
      "category",
      "cuisine",
      "cuisine_type",
      "location_type",
    ],
    filterFields: [
      "owner_user_id",
      "owner_email",
      "is_claimed",
      "claim_code",
      "claim_url",
      "claim_qr_url",
      "qr_link",
      "qr_code_data_url",
      "active",
      "is_searchable",
      "sales_campaign", "partner_launch_selected", "partner_launch_pilot", "claim_outreach_status",
      "partner_sales_status", "next_action_due_at", "reservation_portal_status", "reservation_embed_status",
      "discovery_profile_status", "partner_activated_at", "owner_contact_missing", "market", "county", "city", "state",
    ],
    orderFields: ["updated_at", "created_at", "name"],
  },
];

const CRM_SOURCE_TABLES = CRM_SOURCE_CONFIGS.map((source) => source.name);
const CLAIM_SOURCE_TABLES = [
  "business_claims",
  "location_claim_requests",
  "owner_claims",
  "claim_requests",
] as const;
const PENDING_CLAIM_STATUSES = new Set([
  "pending",
  "pending-review",
  "submitted",
  "awaiting-review",
  "needs-review",
  "pending-claim",
]);

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanStatus(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeStatus(value: unknown) {
  return cleanStatus(value)
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function titleizeStatus(value: unknown) {
  return cleanStatus(value)
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function hasText(value: unknown) {
  return cleanStatus(value).length > 0;
}

function hasReservationLink(row: Partial<BusinessCRMRow>) {
  return [
    row.reservation_url,
    row.reservation_link,
    row.booking_url,
    row.external_reservation_url,
    row.best_reservation_url,
  ].some(hasText);
}

function isFreeOrInactivePlan(row: Partial<BusinessCRMRow>) {
  const plan = normalizeStatus(row.plan ?? row.subscription_plan);
  const status = normalizeStatus(row.plan_status ?? row.subscription_status);
  return (
    !plan ||
    ["free", "free-discovery", "inactive"].includes(plan) ||
    ["inactive", "canceled", "cancelled"].includes(status)
  );
}

function isReservePlan(row: Partial<BusinessCRMRow>) {
  const plan = normalizeStatus(row.plan ?? row.subscription_plan);
  return plan.includes("reserve") || plan.includes("pro-reserve");
}

function isActiveOrSearchable(row: Partial<BusinessCRMRow>) {
  return (
    row.active !== false ||
    row.is_searchable !== false ||
    !["inactive", "hidden", "disabled"].includes(normalizeStatus(row.status))
  );
}

function isOverdueDate(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function hasImage(row: Partial<BusinessCRMRow>) {
  return (
    [row.image_url, row.main_image].some(hasText) ||
    Boolean(Array.isArray(row.images) && row.images.length)
  );
}

export function getClaimStatus(row: Partial<BusinessCRMRow>) {
  const raw = cleanStatus(row.claim_status);
  if (raw) {
    const normalized = normalizeStatus(raw);
    if (PENDING_CLAIM_STATUSES.has(normalized)) return "Pending Claim";
    if (normalized === "approved" || normalized === "claimed") return "Claimed";
    if (normalized === "rejected" || normalized === "denied") return "Rejected";
    if (normalized === "unclaimed") return "Unclaimed";
    return titleizeStatus(raw);
  }
  return row.is_claimed ? "Claimed" : "Unclaimed";
}

export function getDisplayCRMStatus(row: Partial<BusinessCRMRow>) {
  const raw = cleanStatus(row.crm_status);
  const claim = getClaimStatus(row).toLowerCase();
  const normalized = normalizeStatus(raw);
  if (
    !raw ||
    normalized === "unclaimed" ||
    normalized === normalizeStatus(claim)
  )
    return "Needs Outreach" as CRMStatus;
  if (normalized === "claimed") return "Active Free";
  if (normalized === "pro") return "Active Pro";
  if (normalized === "at-risk") return "At Risk";
  if (
    normalized === "upgrade-opportunity" ||
    normalized === "upgrade-opportunities"
  )
    return "Upgrade Opportunity";
  return titleizeStatus(raw) as CRMStatus;
}

export function normalizeCRMRow(row: Record<string, any>): BusinessCRMRow {
  const base = {
    ...row,
    id: String(row.id ?? row.location_id ?? ""),
    location_id: row.location_id ?? row.id,
    name: String(
      row.name ??
        row.location_name ??
        row.restaurant_name ??
        row.activity_name ??
        "Untitled Location",
    ),
    location_name:
      row.location_name ??
      row.name ??
      row.restaurant_name ??
      row.activity_name ??
      "Untitled Location",
    city: row.city ?? "",
    borough: row.borough ?? row.neighborhood ?? row.city ?? "",
    state: row.state ?? "",
    zip: row.zip ?? row.zip_code ?? "",
    zip_code: row.zip_code ?? row.zip ?? "",
    category: row.category ?? row.primary_category ?? "",
    cuisine: row.cuisine ?? row.cuisine_type ?? "",
    image_url: row.image_url ?? row.main_image ?? "",
    main_image: row.main_image ?? row.image_url ?? "",
    reservation_url:
      row.best_reservation_url ??
      row.reservation_url ??
      row.reservation_link ??
      row.booking_url ??
      row.external_reservation_url ??
      "",
    plan:
      row.plan ??
      row.subscription_plan ??
      (row.is_pro ? "pro" : "free_discovery"),
    plan_status:
      row.plan_status ??
      row.subscription_status ??
      (row.is_pro ? "active" : "inactive"),
    is_claimed: Boolean(
      row.is_claimed ||
      cleanStatus(row.claim_status).toLowerCase() === "claimed",
    ),
    is_searchable:
      row.is_searchable == null ? true : Boolean(row.is_searchable),
    active:
      row.active == null ? row.status !== "inactive" : Boolean(row.active),
    is_pro: Boolean(
      row.is_pro || row.plan === "pro" || row.subscription_plan === "pro",
    ),
    market: row.market ?? inferMarketFromCityStateCounty(row),
    region: row.region ?? row.market ?? null,
    county: row.county ?? null,
    google_place_id: row.google_place_id ?? row.place_id ?? null,
    latitude: row.latitude ?? row.lat ?? null,
    longitude: row.longitude ?? row.lng ?? row.lon ?? null,
    location_type:
      row.location_type === "activities"
        ? "activities"
        : row.location_type === "restaurants"
          ? "restaurants"
          : null,
    opportunity_score: toNumber(row.opportunity_score ?? row.upgrade_score),
    upgrade_score: toNumber(row.upgrade_score ?? row.opportunity_score),
    upgrade_probability: toNumber(row.upgrade_probability),
    engagement_score: toNumber(row.engagement_score),
    traffic_score: toNumber(row.traffic_score),
    conversion_score: toNumber(row.conversion_score),
    retention_score: toNumber(row.retention_score),
    churn_risk_score: toNumber(row.churn_risk_score ?? row.churn_risk),
    churn_risk: toNumber(row.churn_risk ?? row.churn_risk_score),
    trending_score: toNumber(row.trending_score ?? row.trend_score),
    profile_quality_score: toNumber(
      row.profile_quality_score ?? row.quality_score,
    ),
    seo_score: toNumber(row.seo_score),
    reservation_readiness_score: toNumber(row.reservation_readiness_score),
    open_tasks: toNumber(row.open_tasks),
    open_support_tickets: toNumber(row.open_support_tickets),
    pending_claims: toNumber(row.pending_claims),
    qr_scans_30d: toNumber(row.qr_scans_30d),
    call_clicks_30d: toNumber(row.call_clicks_30d),
    website_clicks_30d: toNumber(row.website_clicks_30d),
    reservation_completions_30d: toNumber(row.reservation_completions_30d),
    profile_views_30d: toNumber(row.profile_views_30d),
    search_appearances_30d: toNumber(row.search_appearances_30d),
    saves_30d: toNumber(row.saves_30d),
    conversion_rate_30d: toNumber(row.conversion_rate_30d),
  } as BusinessCRMRow;
  return {
    ...base,
    claim_status: getClaimStatus(base),
    crm_status: getDisplayCRMStatus(base),
  };
}


const PARTNER_PLAN_VALUES = new Set(["pro", "reserve", "pro-reserve", "pro-reserve", "partner-99", "partner", "theouthaven-partner"]);
export function getPartnerPlanDisplay(row: Partial<BusinessCRMRow>) {
  const plan = normalizeStatus(row.plan ?? row.subscription_plan ?? row.partner_plan_name);
  const status = normalizeStatus(row.plan_status ?? row.subscription_status);
  if (["canceled", "cancelled"].includes(status)) return "Canceled";
  if (status === "comped") return "Comped Partner";
  if (PARTNER_PLAN_VALUES.has(plan) || row.is_pro || isPartnerActive(row)) return "TheOutHaven Partner Plan — $99/month";
  return "Free Discovery";
}
export function isPartnerActive(row: Partial<BusinessCRMRow>) {
  const plan = normalizeStatus(row.plan ?? row.subscription_plan);
  const status = normalizeStatus(row.plan_status ?? row.subscription_status);
  const sales = normalizeStatus(row.partner_sales_status);
  if (["active-partner", "reservation-ready"].includes(sales)) return true;
  if (["active", "comped"].includes(status) && !["free", "free-discovery", "inactive"].includes(plan)) return true;
  return Boolean(row.is_pro && ["active", "comped"].includes(status));
}
export function getPartnerSalesStatus(row: Partial<BusinessCRMRow>) { return normalizeStatus(row.partner_sales_status || (isPartnerActive(row) ? "active_partner" : "target")).replace(/-/g, "_"); }
export function getClaimOutreachStatus(row: Partial<BusinessCRMRow>) { return normalizeStatus(row.claim_outreach_status || (row.claim_sent_at ? "sent" : "not_sent")).replace(/-/g, "_"); }
export function getReservationPortalStatus(row: Partial<BusinessCRMRow>) { return normalizeStatus(row.reservation_portal_status || ((row as any).reservation_enabled || (row as any).internal_reservations_enabled || (row as any).uses_internal_reservations ? "enabled" : "not_enabled")).replace(/-/g, "_"); }
export function getEmbedStatus(row: Partial<BusinessCRMRow>) { return normalizeStatus(row.reservation_embed_status || ((row as any).reservation_embed_enabled ? "generated" : "not_sent")).replace(/-/g, "_"); }
export function getDiscoveryStatus(row: Partial<BusinessCRMRow>) { return normalizeStatus(row.discovery_profile_status || (row.is_searchable && hasImage(row) ? "ready" : "needs_review")).replace(/-/g, "_"); }
export function getNextActionLabel(row: Partial<BusinessCRMRow>) { return cleanStatus(row.next_action) || (row.next_action_due_at ? "Follow up" : "Set next action"); }
function pct(parts: boolean[]) { return Math.round((parts.filter(Boolean).length / Math.max(parts.length, 1)) * 100); }
export function getSalesReadinessScore(row: Partial<BusinessCRMRow>) { return toNumber(row.sales_readiness_score) || pct([hasText(row.name), hasText(row.address), hasText(row.category ?? row.primary_category), hasText(row.phone) || hasText(row.website), hasImage(row), hasText(row.claim_code) || hasText(row.claim_url), normalizeStatus(row.outreach_status) !== "do-not-contact", row.is_searchable !== false]); }
export function getReservationPortalReadinessScore(row: Partial<BusinessCRMRow>) { const c=(row.partner_setup_checklist||{}) as any; return toNumber(row.reservation_portal_readiness_score) || pct([isPartnerActive(row), ["enabled","tested","live"].includes(getReservationPortalStatus(row)), Boolean(c.reservation_availability_set), Boolean(c.party_size_rules_set), hasText(row.owner_email)||hasText(row.webmaster_email)||hasText(row.phone), Boolean(c.test_reservation_completed)||hasText(row.reservation_portal_tested_at)]); }
export function getEmbedReadinessScore(row: Partial<BusinessCRMRow>) { const s=getEmbedStatus(row), c=(row.partner_setup_checklist||{}) as any; return toNumber(row.embed_readiness_score) || pct([s!=="not_sent"||c.embed_code_generated, ["sent","installed","tested"].includes(s)||c.embed_code_sent, ["installed","tested"].includes(s)||c.embed_installed, s==="tested"||c.embed_tested]); }
export function getDiscoveryReadinessScore(row: Partial<BusinessCRMRow>) { return toNumber(row.discovery_readiness_score) || pct([row.is_searchable!==false, hasImage(row), hasText(row.category)||hasText(row.cuisine), Boolean((row as any).hours)||Boolean((row as any).opening_hours), ["enabled","tested","live"].includes(getReservationPortalStatus(row))]); }
export function getPartnerSetupScore(row: Partial<BusinessCRMRow>) { return toNumber(row.partner_setup_score) || Math.round((getSalesReadinessScore(row)+getReservationPortalReadinessScore(row)+getEmbedReadinessScore(row)+getDiscoveryReadinessScore(row))/4); }

function normalizeCRMRows(
  rows: Record<string, any>[] | null | undefined,
): BusinessCRMRow[] {
  return (rows ?? []).map((row) => normalizeCRMRow(row));
}

export function normalizeCRMSearchText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCRMSearchHaystack(row: Partial<BusinessCRMRow>) {
  return [
    row.name,
    row.location_name,
    (row as any).restaurant_name,
    (row as any).activity_name,
    (row as any).business_name,
    row.address,
    row.city,
    row.borough,
    (row as any).neighborhood,
    row.state,
    row.owner_email,
    (row as any).claimed_by_email,
    (row as any).claimed_email,
    row.phone,
    row.category,
    row.primary_category,
    row.cuisine,
    row.cuisine_type,
    row.location_type,
    row.website,
    row.owner_instagram,
    row.claim_code,
    row.market,
    row.region,
    row.county,
  ].filter(Boolean).join(" ");
}

function rowMatchesSearch(row: Partial<BusinessCRMRow>, q?: string) {
  const rawTerm = String(q || "").trim().toLowerCase();
  if (!rawTerm) return true;
  const normalizedTerm = normalizeCRMSearchText(rawTerm);
  if (!normalizedTerm) return true;
  const rawHaystack = buildCRMSearchHaystack(row).toLowerCase();
  const normalizedHaystack = normalizeCRMSearchText(rawHaystack);
  if (rawHaystack.includes(rawTerm) || normalizedHaystack.includes(normalizedTerm)) return true;
  const tokens = normalizedTerm.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => normalizedHaystack.includes(token));
}

function claimMatchesSearch(claim: PendingCRMClaim, q?: string) {
  const term = String(q || "")
    .trim()
    .toLowerCase();
  if (!term) return true;
  return [
    claim.submitted_business_name,
    claim.claimant_name,
    claim.claimant_email,
    claim.claimant_phone,
    claim.status,
  ].some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(term),
  );
}

export function isUpgradeOpportunity(row: Partial<BusinessCRMRow>) {
  if (!isFreeOrInactivePlan(row) || !isActiveOrSearchable(row)) return false;
  const crmStatus = normalizeStatus(row.crm_status);
  const claimStatus = normalizeStatus(row.claim_status);
  const claimedFree = claimStatus === "claimed" && isFreeOrInactivePlan(row);
  return (
    toNumber(row.search_appearances_30d) > 0 ||
    toNumber(row.profile_views_30d) > 0 ||
    toNumber(row.reservation_completions_30d) > 0 ||
    !hasReservationLink(row) ||
    claimedFree ||
    crmStatus === "upgrade-opportunity" ||
    crmStatus === "upgrade-opportunities" ||
    toNumber((row as any).upgrade_score ?? row.opportunity_score) > 0
  );
}

export function isAtRiskLocation(row: Partial<BusinessCRMRow>) {
  const crmStatus = normalizeStatus(row.crm_status);
  const planStatus = normalizeStatus(
    row.plan_status ?? row.subscription_status,
  );
  return (
    crmStatus === "at-risk" ||
    toNumber((row as any).churn_risk ?? row.churn_risk_score) > 0 ||
    ["past-due", "canceled", "cancelled"].includes(planStatus) ||
    row.active === false ||
    row.is_searchable === false ||
    !hasImage(row) ||
    !hasText(row.phone) ||
    !hasText(row.website) ||
    (isReservePlan(row) && !hasReservationLink(row)) ||
    isOverdueDate(row.follow_up_date)
  );
}

function matchesBusinessFilter(row: BusinessCRMRow, filter?: string) {
  switch (normalizeStatus(filter || "all")) {
    case "upgrade-opportunities":
    case "upgrade-opportunity":
      return isUpgradeOpportunity(row);
    case "at-risk":
      return isAtRiskLocation(row);
    case "owner-accounts":
    case "owners":
      return Boolean(row.owner_user_id || row.owner_email || row.is_claimed);
    case "location-tasks":
    case "open-tasks":
      return toNumber(row.open_tasks) > 0;
    case "follow-ups":
      return Boolean(row.follow_up_date);
    case "qr-codes":
    case "qr":
      return [
        row.claim_qr_url,
        row.qr_link,
        row.qr_code_data_url,
        row.claim_code,
        row.claim_url,
      ].some(hasText);
    case "partner-launch": return Boolean(row.partner_launch_selected) || normalizeStatus(row.sales_campaign) === "partner-launch";
    case "launch-pilot": return Boolean(row.partner_launch_pilot);
    case "claim-not-sent": return getClaimOutreachStatus(row) === "not_sent";
    case "claim-sent": return getClaimOutreachStatus(row) === "sent";
    case "claim-started": return getClaimOutreachStatus(row) === "started";
    case "claim-approved": return getClaimOutreachStatus(row) === "approved";
    case "payment-pending": return getPartnerSalesStatus(row) === "payment_pending";
    case "active-partners": return isPartnerActive(row);
    case "reservation-ready": return getPartnerSalesStatus(row) === "reservation_ready" || getReservationPortalStatus(row) === "live";
    case "embed-needed": return !["sent","installed","tested","not_needed"].includes(getEmbedStatus(row));
    case "embed-sent": return getEmbedStatus(row) === "sent";
    case "embed-installed": return ["installed","tested"].includes(getEmbedStatus(row));
    case "discovery-needed": return getDiscoveryStatus(row) !== "ready";
    case "follow-ups-due": return Boolean(row.next_action_due_at && !isOverdueDate(null) && new Date(row.next_action_due_at).getTime() <= Date.now() + 86400000);
    case "owner-contact-missing": return Boolean(row.owner_contact_missing) || (!hasText(row.owner_email) && !hasText(row.phone) && !hasText(row.owner_instagram));
    case "market-issues": { const market = inferMarketFromCityStateCounty(row); return !validatePlaceForMarket({ requestedMarket: market, city: row.city, state: row.state, county: row.county, borough: row.borough, address: row.address }).ok; }
    case "all":
    default:
      return true;
  }
}

function sortCRMRows(rows: BusinessCRMRow[], filter?: string) {
  const normalized = normalizeStatus(filter || "all");
  return [...rows].sort((a, b) => {
    if (normalized === "at-risk")
      return (
        toNumber((b as any).churn_risk ?? b.churn_risk_score) -
          toNumber((a as any).churn_risk ?? a.churn_risk_score) ||
        String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
      );
    return (
      toNumber((b as any).upgrade_score ?? b.opportunity_score) -
        toNumber((a as any).upgrade_score ?? a.opportunity_score) ||
      String(b.updated_at || b.created_at || "").localeCompare(
        String(a.updated_at || a.created_at || ""),
      )
    );
  });
}

type CRMPageOptions = {
  page?: number;
  pageSize?: number;
  query?: string;
  filter?: string;
  market?: string;
};

type CRMRowsResult = {
  rows: BusinessCRMRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  source: CRMSourceName | null;
};

const VALID_PAGE_SIZES = new Set([25, 50, 100]);

function getSafePageSize(pageSize?: number) {
  const parsed = Number(pageSize) || 25;
  return VALID_PAGE_SIZES.has(parsed) ? parsed : 25;
}

function getSafePage(page?: number) {
  return Math.max(Number(page) || 1, 1);
}

function escapePostgrestLike(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export function getCRMSourceConfig(sourceName: string): CRMSourceConfig {
  return (
    CRM_SOURCE_CONFIGS.find((source) => source.name === sourceName) ??
    CRM_SOURCE_CONFIGS[CRM_SOURCE_CONFIGS.length - 1]
  );
}

export function buildCRMSearchFilterForSource(
  source: CRMSourceConfig,
  q?: string,
) {
  const term = String(q || "").trim();
  if (!term) return "";
  const like = `%${escapePostgrestLike(term)}%`;
  return source.searchableFields
    .map((field) => `${field}.ilike.${like}`)
    .join(",");
}

function buildCRMMarketFilter(market?: string) {
  const normalized = String(market || "").trim();
  if (!normalized || normalized === "all") return "";
  return `market.eq.${normalized}`;
}

function buildCRMViewFilterForSource(source: CRMSourceConfig, filter?: string) {
  const normalized = normalizeStatus(filter || "all");
  const has = (field: string) => source.filterFields.includes(field);
  const clauses: string[] = [];

  switch (normalized) {
    case "owner-accounts":
    case "owners":
      if (has("owner_user_id")) clauses.push("owner_user_id.not.is.null");
      if (has("owner_email")) clauses.push("owner_email.not.is.null");
      if (has("is_claimed")) clauses.push("is_claimed.eq.true");
      break;
    case "location-tasks":
    case "open-tasks":
      if (has("open_tasks")) clauses.push("open_tasks.gt.0");
      break;
    case "follow-ups":
      if (has("follow_up_date")) clauses.push("follow_up_date.not.is.null");
      break;
    case "qr-codes":
    case "qr":
      for (const field of [
        "claim_qr_url",
        "qr_link",
        "qr_code_data_url",
        "claim_code",
        "claim_url",
      ]) {
        if (has(field)) clauses.push(`${field}.not.is.null`);
      }
      break;
    case "upgrade-opportunities":
    case "upgrade-opportunity":
      for (const clause of [
        ["opportunity_score", "opportunity_score.gt.0"],
        ["upgrade_score", "upgrade_score.gt.0"],
        ["search_appearances_30d", "search_appearances_30d.gt.0"],
        ["profile_views_30d", "profile_views_30d.gt.0"],
        ["reservation_completions_30d", "reservation_completions_30d.gt.0"],
        ["crm_status", "crm_status.ilike.%upgrade%"],
      ] as const) {
        if (has(clause[0])) clauses.push(clause[1]);
      }
      break;
    case "at-risk":
      for (const clause of [
        ["crm_status", "crm_status.ilike.%risk%"],
        ["churn_risk_score", "churn_risk_score.gt.0"],
        ["churn_risk", "churn_risk.gt.0"],
        ["active", "active.eq.false"],
        ["is_searchable", "is_searchable.eq.false"],
        ["plan_status", "plan_status.in.(past-due,canceled,cancelled)"],
        [
          "subscription_status",
          "subscription_status.in.(past-due,canceled,cancelled)",
        ],
      ] as const) {
        if (has(clause[0])) clauses.push(clause[1]);
      }
      break;
    case "partner-launch": if (has("partner_launch_selected")) clauses.push("partner_launch_selected.eq.true"); if (has("sales_campaign")) clauses.push("sales_campaign.eq.partner_launch"); break;
    case "launch-pilot": if (has("partner_launch_pilot")) clauses.push("partner_launch_pilot.eq.true"); break;
    case "claim-not-sent": if (has("claim_outreach_status")) clauses.push("claim_outreach_status.eq.not_sent"); break;
    case "claim-sent": if (has("claim_outreach_status")) clauses.push("claim_outreach_status.eq.sent"); break;
    case "claim-started": if (has("claim_outreach_status")) clauses.push("claim_outreach_status.eq.started"); break;
    case "claim-approved": if (has("claim_outreach_status")) clauses.push("claim_outreach_status.eq.approved"); break;
    case "payment-pending": if (has("partner_sales_status")) clauses.push("partner_sales_status.eq.payment_pending"); break;
    case "active-partners": if (has("partner_sales_status")) clauses.push("partner_sales_status.in.(active_partner,reservation_ready)"); if (has("plan_status")) clauses.push("plan_status.in.(active,comped)"); break;
    case "reservation-ready": if (has("partner_sales_status")) clauses.push("partner_sales_status.eq.reservation_ready"); if (has("reservation_portal_status")) clauses.push("reservation_portal_status.in.(live,tested)"); break;
    case "embed-needed": if (has("reservation_embed_status")) clauses.push("reservation_embed_status.in.(not_sent,generated,needs_help)"); break;
    case "embed-sent": if (has("reservation_embed_status")) clauses.push("reservation_embed_status.eq.sent"); break;
    case "embed-installed": if (has("reservation_embed_status")) clauses.push("reservation_embed_status.in.(installed,tested)"); break;
    case "discovery-needed": if (has("discovery_profile_status")) clauses.push("discovery_profile_status.neq.ready"); break;
    case "follow-ups-due": if (has("next_action_due_at")) clauses.push(`next_action_due_at.lte.${new Date(Date.now()+86400000).toISOString()}`); break;
    case "owner-contact-missing": if (has("owner_contact_missing")) clauses.push("owner_contact_missing.eq.true"); break;
    case "all":
    default:
      break;
  }

  return clauses.join(",");
}

function applyCRMOrderingForSource(queryBuilder: any, source: CRMSourceConfig) {
  let orderedQuery = queryBuilder;
  if (source.orderFields.includes("updated_at")) {
    orderedQuery = orderedQuery.order("updated_at", {
      ascending: false,
      nullsFirst: false,
    });
  }
  if (source.orderFields.includes("created_at")) {
    orderedQuery = orderedQuery.order("created_at", {
      ascending: false,
      nullsFirst: false,
    });
  }
  if (source.orderFields.includes("name")) {
    orderedQuery = orderedQuery.order("name", {
      ascending: true,
      nullsFirst: false,
    });
  }
  return orderedQuery;
}

function missingColumnFromError(error: any) {
  const message = String(error?.message || error?.details || "");
  return (
    message.match(/Could not find the '([^']+)' column/i)?.[1] ||
    message.match(
      /column [^.]*(?:\.|")?([a-zA-Z0-9_]+)(?:")? does not exist/i,
    )?.[1] ||
    null
  );
}

export async function fetchCRMRowsFromSource(
  sourceConfig: CRMSourceConfig,
  options: CRMPageOptions,
): Promise<CRMRowsResult> {
  const safePageSize = getSafePageSize(options.pageSize);
  const safePage = getSafePage(options.page);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  let source = {
    ...sourceConfig,
    searchableFields: [...sourceConfig.searchableFields],
    filterFields: [...sourceConfig.filterFields],
    orderFields: [...sourceConfig.orderFields],
  };

  for (let attempt = 0; attempt < 50; attempt += 1) {
    let queryBuilder = supabaseAdmin
      .from(source.name)
      .select(CRM_SELECT, { count: "exact" });
    const searchFilter = buildCRMSearchFilterForSource(source, options.query);
    const viewFilter = buildCRMViewFilterForSource(source, options.filter);
    const marketFilter = buildCRMMarketFilter(options.market);
    if (String(options.query || "").trim() && !searchFilter) {
      // Continue without a DB OR search; the in-memory fallback below will apply robust matching.
    }

    if (searchFilter) queryBuilder = queryBuilder.or(searchFilter);
    if (viewFilter) queryBuilder = queryBuilder.or(String(viewFilter));
    if (marketFilter && source.filterFields.includes("market")) queryBuilder = queryBuilder.filter("market", "eq", options.market);
    queryBuilder = applyCRMOrderingForSource(queryBuilder, source).range(
      from,
      to,
    );

    const { data, error, count } = await queryBuilder;
    if (!error) {
      const rows = normalizeCRMRows(data || []);
      return {
        rows,
        total: count || 0,
        page: safePage,
        pageSize: safePageSize,
        totalPages: Math.max(1, Math.ceil((count || 0) / safePageSize)),
        source: source.name,
      };
    }

    const missingColumn = missingColumnFromError(error);
    if (!missingColumn) throw error;

    source = {
      ...source,
      searchableFields: source.searchableFields.filter(
        (field) => field !== missingColumn,
      ),
      filterFields: source.filterFields.filter(
        (field) => field !== missingColumn,
      ),
      orderFields: source.orderFields.filter(
        (field) => field !== missingColumn,
      ),
    };
  }

  throw new Error(
    `Unable to fetch CRM rows from ${sourceConfig.name} after removing missing columns.`,
  );
}

async function fetchCRMRowsForInMemorySearch(sourceConfig: CRMSourceConfig, filter?: string) {
  let source = {
    ...sourceConfig,
    searchableFields: [...sourceConfig.searchableFields],
    filterFields: [...sourceConfig.filterFields],
    orderFields: [...sourceConfig.orderFields],
  };
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let queryBuilder = supabaseAdmin.from(source.name).select(CRM_SELECT).limit(5000);
    const viewFilter = buildCRMViewFilterForSource(source, filter);
    if (viewFilter) queryBuilder = queryBuilder.or(String(viewFilter));
    queryBuilder = applyCRMOrderingForSource(queryBuilder, source);
    const { data, error } = await queryBuilder;
    if (!error) return normalizeCRMRows(data || []);
    const missingColumn = missingColumnFromError(error);
    if (!missingColumn) throw error;
    source = {
      ...source,
      searchableFields: source.searchableFields.filter((field) => field !== missingColumn),
      filterFields: source.filterFields.filter((field) => field !== missingColumn),
      orderFields: source.orderFields.filter((field) => field !== missingColumn),
    };
  }
  return [];
}

export async function fetchCRMRowsWithFallback(
  options: CRMPageOptions,
): Promise<CRMRowsResult> {
  const safePageSize = getSafePageSize(options.pageSize);
  const safePage = getSafePage(options.page);

  for (const source of CRM_SOURCE_CONFIGS) {
    try {
      const result = await fetchCRMRowsFromSource(source, {
        ...options,
        page: safePage,
        pageSize: safePageSize,
      });
      if (String(options.query || "").trim() && result.rows.length === 0) {
        const fallback = await fetchCRMRowsForInMemorySearch(source, normalizeStatus(options.filter || "all") === "all" ? "all" : options.filter);
        let matched = fallback.filter((row) => rowMatchesSearch(row, options.query) && (!options.market || options.market === "all" || row.market === options.market));
        if (!matched.length && normalizeStatus(options.filter || "all") !== "all") {
          const allFallback = await fetchCRMRowsForInMemorySearch(source, "all");
          matched = allFallback.filter((row) => rowMatchesSearch(row, options.query));
        }
        if (matched.length) {
          const from = (safePage - 1) * safePageSize;
          return { rows: matched.slice(from, from + safePageSize), total: matched.length, page: safePage, pageSize: safePageSize, totalPages: Math.max(1, Math.ceil(matched.length / safePageSize)), source: source.name };
        }
      }
      if (
        result.rows.length > 0 ||
        result.total > 0 ||
        source.name === "locations"
      )
        return result;
      console.warn(
        `CRM source ${source.name} returned zero rows; trying next fallback source.`,
      );
    } catch (error: any) {
      console.error(
        `Failed to fetch ${source.name} CRM page`,
        error?.message || error,
      );
    }
  }

  return {
    rows: [],
    total: 0,
    page: safePage,
    pageSize: safePageSize,
    totalPages: 1,
    source: null,
  };
}

async function countCRMRowsFromSource(
  sourceConfig: CRMSourceConfig,
  filter?: string,
) {
  let source = {
    ...sourceConfig,
    searchableFields: [...sourceConfig.searchableFields],
    filterFields: [...sourceConfig.filterFields],
    orderFields: [...sourceConfig.orderFields],
  };

  for (let attempt = 0; attempt < 50; attempt += 1) {
    let queryBuilder = supabaseAdmin
      .from(source.name)
      .select("id", { count: "exact", head: true });
    const viewFilter = buildCRMViewFilterForSource(source, filter);
    if (normalizeStatus(filter || "all") !== "all" && !viewFilter) return 0;
    if (viewFilter) queryBuilder = queryBuilder.or(String(viewFilter));

    const { count, error } = await queryBuilder;
    if (!error) return count || 0;

    const missingColumn = missingColumnFromError(error);
    if (!missingColumn) throw error;
    source = {
      ...source,
      filterFields: source.filterFields.filter(
        (field) => field !== missingColumn,
      ),
    };
  }

  throw new Error(`Unable to count CRM rows from ${sourceConfig.name}.`);
}

async function countCRMRowsWithFallback(filter?: string) {
  for (const source of CRM_SOURCE_CONFIGS) {
    try {
      const count = await countCRMRowsFromSource(source, filter);
      if (count > 0 || source.name === "locations") return count;
    } catch (error: any) {
      console.error(
        `CRM count source ${source.name} failed`,
        error?.message || error,
      );
    }
  }
  return 0;
}

async function countFromLocations(builder: (q: any) => any) {
  try {
    const { count, error } = await builder(
      supabaseAdmin
        .from("locations")
        .select("id", { count: "exact", head: true }),
    );

    if (error) {
      console.error("CRM count query failed:", error.message);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error("CRM count query crashed:", error);
    return 0;
  }
}

async function sumFromLocations(column: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select(column)
      .limit(5000);

    if (error) {
      console.error(`CRM sum query failed for ${column}:`, error.message);
      return 0;
    }

    return (data || []).reduce(
      (sum: number, row: any) => sum + toNumber(row[column]),
      0,
    );
  } catch (error) {
    console.error(`CRM sum query crashed for ${column}:`, error);
    return 0;
  }
}

function normalizeClaim(row: any, sourceTable = "claims"): PendingCRMClaim {
  return {
    ...row,
    id: String(
      row.id ??
        `${sourceTable}-${row.location_id ?? row.email ?? row.claimant_email ?? row.created_at ?? "claim"}`,
    ),
    source_table: sourceTable,
    location_id:
      row.location_id ?? row.business_id ?? row.location_uuid ?? null,
    status: getClaimStatus({
      claim_status: row.status ?? row.claim_status,
      is_claimed: false,
    }),
    claimant_name:
      row.claimant_name ??
      row.owner_name ??
      row.name ??
      row.contact_name ??
      row.full_name,
    claimant_email:
      row.claimant_email ?? row.owner_email ?? row.email ?? row.contact_email,
    claimant_phone:
      row.claimant_phone ?? row.owner_phone ?? row.phone ?? row.contact_phone,
    submitted_business_name:
      row.submitted_business_name ??
      row.business_name ??
      row.location_name ??
      row.restaurant_name ??
      row.activity_name ??
      row.name,
    submitted_at: row.submitted_at ?? row.created_at ?? row.inserted_at,
    review_notes: row.review_notes ?? row.notes ?? row.admin_notes,
  };
}

async function fetchClaimRows(table: string) {
  const ordered = await safeSelect(table, (q) =>
    q.select("*").order("created_at", { ascending: false }).limit(1000),
  );
  if (ordered.length > 0) return ordered;
  return safeSelect(table, (q) => q.select("*").limit(1000));
}

export async function listPendingCRMClaims(
  query?: string,
): Promise<PendingCRMClaim[]> {
  const claims: PendingCRMClaim[] = [];
  const seen = new Set<string>();
  for (const table of CLAIM_SOURCE_TABLES) {
    const rows = await fetchClaimRows(table);
    for (const row of rows as any[]) {
      const claim = normalizeClaim(row, table);
      if (
        !PENDING_CLAIM_STATUSES.has(
          normalizeStatus(row.status ?? row.claim_status ?? claim.status),
        )
      )
        continue;
      const key = `${claim.source_table}:${claim.id}`;
      if (seen.has(key) || !claimMatchesSearch(claim, query)) continue;
      seen.add(key);
      claims.push(claim);
    }
  }
  return claims.sort((a, b) =>
    String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")),
  );
}

export async function listBusinessCRMPage({
  page = 1,
  pageSize = 25,
  query,
  filter,
  market,
}: {
  page?: number;
  pageSize?: number;
  query?: string;
  filter?: string;
  market?: string;
}) {
  const safePageSize = getSafePageSize(pageSize);
  const safePage = getSafePage(page);
  const from = (safePage - 1) * safePageSize;
  const normalizedFilter = normalizeStatus(
    filter || "all",
  ) as BusinessCRMFilter;

  if (normalizedFilter === "pending-claims") {
    const claims = await listPendingCRMClaims(query);

    return {
      rows: [] as BusinessCRMRow[],
      pendingClaims: claims.slice(from, from + safePageSize),
      total: claims.length,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(claims.length / safePageSize)),
    };
  }

  const pageData = await fetchCRMRowsWithFallback({
    page: safePage,
    pageSize: safePageSize,
    query,
    filter: normalizedFilter,
    market,
  });

  return {
    rows: pageData.rows,
    pendingClaims: [] as PendingCRMClaim[],
    total: pageData.total,
    page: pageData.page,
    pageSize: pageData.pageSize,
    totalPages: pageData.totalPages,
    source: pageData.source,
  };
}

export async function listBusinessCRM(limit = 1000): Promise<BusinessCRMRow[]> {
  const page = await listBusinessCRMPage({
    page: 1,
    pageSize: Math.min(limit, 100),
  });

  return page.rows;
}

export async function getBusinessCRMSummary(): Promise<BusinessCRMSummary> {
  const [
    total,
    searchable,
    claimed,
    pendingClaims,
    upgradeCandidates,
    atRisk,
    openTasks,
    followUps,
    qrCodes,
    reservationIntent,
    searchAppearances, partnerLaunchTotal, launchPilotTotal, claimNotSent, claimSent, claimStarted, claimApproved, paymentPending, activePartners, reservationReady, embedNeeded, embedSent, embedInstalled, discoveryNeeded, ownerContactMissing, followUpsDueToday,
  ] = await Promise.all([
    countCRMRowsWithFallback("all"),
    countFromLocations((q) => q.eq("is_searchable", true)),
    countCRMRowsWithFallback("owner-accounts"),
    listPendingCRMClaims(),
    countCRMRowsWithFallback("upgrade-opportunities"),
    countCRMRowsWithFallback("at-risk"),
    sumFromLocations("open_tasks"),
    countCRMRowsWithFallback("follow-ups"),
    countCRMRowsWithFallback("qr-codes"),
    sumFromLocations("reservation_completions_30d"),
    sumFromLocations("search_appearances_30d"),
    countCRMRowsWithFallback("partner-launch"), countCRMRowsWithFallback("launch-pilot"), countCRMRowsWithFallback("claim-not-sent"), countCRMRowsWithFallback("claim-sent"), countCRMRowsWithFallback("claim-started"), countCRMRowsWithFallback("claim-approved"), countCRMRowsWithFallback("payment-pending"), countCRMRowsWithFallback("active-partners"), countCRMRowsWithFallback("reservation-ready"), countCRMRowsWithFallback("embed-needed"), countCRMRowsWithFallback("embed-sent"), countCRMRowsWithFallback("embed-installed"), countCRMRowsWithFallback("discovery-needed"), countCRMRowsWithFallback("owner-contact-missing"), countCRMRowsWithFallback("follow-ups-due"),
  ]);

  const [notSearchable, missingCoordinates, missingPhotos, missingGooglePlaceId, restaurants, activities, marketRows] = await Promise.all([
    countFromLocations((q) => q.eq("is_searchable", false)),
    countFromLocations((q) => q.or("latitude.is.null,longitude.is.null")),
    countFromLocations((q) => q.or("image_url.is.null,main_image.is.null")),
    countFromLocations((q) => q.is("google_place_id", null)),
    countFromLocations((q) => q.eq("location_type", "restaurants")),
    countFromLocations((q) => q.eq("location_type", "activities")),
    safeSelect("locations", (q) => q.select("market").limit(5000)),
  ]);
  const marketCounts = (marketRows as any[]).reduce((acc, row) => { const m = inferMarketFromCityStateCounty(row); acc[m] = (acc[m] || 0) + 1; return acc; }, {} as Partial<Record<MarketKey, number>>);

  return {
    total,
    searchable,
    notSearchable, missingCoordinates, missingPhotos, missingGooglePlaceId, restaurants, activities, marketCounts,
    claimed,
    unclaimed: Math.max(total - claimed, 0),
    pendingClaims: pendingClaims.length,
    pendingClaimsCount: pendingClaims.length,
    upgradeCandidates,
    upgradeOpportunitiesCount: upgradeCandidates,
    atRisk,
    atRiskCount: atRisk,
    openTasks,
    followUps,
    qrCodes,
    reservationIntent,
    searchAppearances, partnerLaunchTotal, launchPilotTotal, claimNotSent, claimSent, claimStarted, claimApproved, paymentPending, activePartners, reservationReady, embedNeeded, embedSent, embedInstalled, discoveryNeeded, ownerContactMissing, followUpsDueToday, mrrCents: activePartners * 9900,
  };
}

export async function getBusinessCRM(
  id: string,
): Promise<BusinessCRMRow | null> {
  for (const source of CRM_SOURCE_CONFIGS) {
    try {
      const { data, error } = await supabaseAdmin
        .from(source.name)
        .select(CRM_SELECT)
        .or(`id.eq.${id},location_id.eq.${id}`)
        .maybeSingle();
      if (!error && data) return normalizeCRMRow(data);
      if (error)
        console.error(
          `Optional CRM detail source ${source.name} unavailable`,
          error.message,
        );
    } catch (error) {
      console.error(`Optional CRM detail source ${source.name} failed`, error);
    }
  }
  return null;
}

export async function safeSelect(table: string, builder: (query: any) => any) {
  try {
    const { data, error } = await builder(supabaseAdmin.from(table));
    if (error) {
      console.error(`Optional CRM table ${table} unavailable`, error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error(`Optional CRM table ${table} failed`, error);
    return [];
  }
}

export async function getLocationCrmRelatedData(locationId: string) {
  const [
    notes,
    reminders,
    businessComms,
    comms,
    logs,
    businessClaims,
    locationClaims,
    ownerClaims,
    supportTickets,
    qr1,
    qr2,
    qr3,
    qr4,
    owners1,
    owners2,
    owners3,
    planChanges,
    photoChanges,
    templates,
    reservations,
  ] = await Promise.all([
    safeSelect("business_crm_notes", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(25),
    ),
    safeSelect("business_crm_reminders", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(25),
    ),
    safeSelect("business_communication_logs", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(25),
    ),
    safeSelect("communication_logs", (q) =>
      q
        .select("*")
        .eq("recipient_id", locationId)
        .order("created_at", { ascending: false })
        .limit(25),
    ),
    safeSelect("admin_system_logs", (q) =>
      q
        .select("*")
        .eq("entity_type", "location")
        .eq("entity_id", locationId)
        .order("created_at", { ascending: false })
        .limit(50),
    ),
    safeSelect("business_claims", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(25),
    ),
    safeSelect("location_claim_requests", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(25),
    ),
    safeSelect("owner_claims", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(25),
    ),
    safeSelect("support_tickets", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(25),
    ),
    safeSelect("location_claim_codes", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(10),
    ),
    safeSelect("claim_qr_codes", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(10),
    ),
    safeSelect("business_claim_codes", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(10),
    ),
    safeSelect("qr_claim_codes", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(10),
    ),
    safeSelect("location_owner_locations", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(10),
    ),
    safeSelect("profiles", (q) =>
      q.select("*").eq("location_id", locationId).limit(10),
    ),
    safeSelect("users", (q) =>
      q.select("*").eq("location_id", locationId).limit(10),
    ),
    safeSelect("location_plan_change_logs", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(25),
    ),
    safeSelect("location_photo_change_logs", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(25),
    ),
    safeSelect("communication_templates", (q) =>
      q.select("*").order("created_at", { ascending: false }).limit(100),
    ),
    safeSelect("reservations", (q) =>
      q
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
  ]);

  return {
    notes,
    reminders,
    communications: [...businessComms, ...comms],
    logs,
    claims: [
      ...businessClaims.map((row: any) =>
        normalizeClaim(row, "business_claims"),
      ),
      ...locationClaims.map((row: any) =>
        normalizeClaim(row, "location_claim_requests"),
      ),
      ...ownerClaims.map((row: any) => normalizeClaim(row, "owner_claims")),
    ],
    supportTickets,
    qrCodes: [...qr1, ...qr2, ...qr3, ...qr4],
    owners: [...owners1, ...owners2, ...owners3],
    planChanges,
    photoChanges,
    templates,
    reservations,
  };
}

export function getUpgradeFlags(business: BusinessCRMRow): string[] {
  const flags: string[] = [];
  if (!business.is_claimed && business.traffic_score >= 70)
    flags.push("High Traffic Free Account");
  if (business.reservation_completions_30d >= 30)
    flags.push("High Reservation Activity");
  if (business.trending_score >= 65) flags.push("Trending Location");
  if (!business.reservation_url) flags.push("Missing Reservation Link");
  if (business.search_appearances_30d >= 200)
    flags.push("Strong Search Visibility");
  if (business.saves_30d >= 20) flags.push("High Save Rate");
  if (business.conversion_rate_30d <= 0.08 && business.traffic_score >= 60)
    flags.push("High Conversion Potential");
  if (business.opportunity_score >= 75)
    flags.push("Candidate For Promoted Listings");
  if ((business.open_tasks || 0) > 0) flags.push("Open CRM Tasks");
  if ((business.pending_claims || 0) > 0) flags.push("Pending Claim");
  return flags;
}

export function dedupeUrls(urls: unknown[]): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of urls) {
    const url = String(raw ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    clean.push(url);
  }
  return clean;
}

export function normalizeImageArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return dedupeUrls(
      value.flatMap((item) => {
        if (typeof item === "string") return [item];
        if (item && typeof item === "object")
          return [
            (item as any).url,
            (item as any).src,
            (item as any).href,
          ].filter(Boolean);
        return [];
      }),
    );
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeImageArray(parsed);
    } catch {}
    return dedupeUrls(trimmed.split(/[\n,]+/));
  }
  return [];
}

export function getLocationMainImage(
  location: Partial<BusinessCRMRow> | Record<string, any>,
) {
  return (
    String(
      (location as any).main_image || (location as any).image_url || "",
    ).trim() || null
  );
}

export function getLocationGalleryImages(
  location: Partial<BusinessCRMRow> | Record<string, any>,
) {
  return dedupeUrls([
    ...normalizeImageArray((location as any).gallery_images),
    ...normalizeImageArray((location as any).gallery),
    ...normalizeImageArray((location as any).photos),
    ...normalizeImageArray((location as any).image_gallery),
    ...normalizeImageArray((location as any).images),
  ]);
}

export function stripCityStateZipFromStreetAddress(
  address?: string | null,
  city?: string | null,
  state?: string | null,
  zip?: string | null,
) {
  return stripCityStateZipFromAddress(address, city, state, zip);
}

export function formatFullAddress({
  address,
  city,
  state,
  zip,
}: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  return sharedFormatFullAddress({
    address,
    city,
    state,
    zip,
    fallback: "",
  });
}

export async function safeUpdateLocationPhotos(
  locationId: string,
  payload: { mainImage?: string | null; galleryImages?: string[] },
) {
  const mainImage = payload.mainImage ?? null;
  const galleryImages = dedupeUrls(payload.galleryImages || []);
  const updates: Record<string, any> = {
    main_image: mainImage,
    image_url: mainImage,
    gallery_images: galleryImages,
    gallery: galleryImages,
    photos: galleryImages,
    image_gallery: galleryImages,
    images: galleryImages,
    updated_at: new Date().toISOString(),
  };
  const missingColumn = (message?: string) =>
    /column .* does not exist|could not find .* column|schema cache/i.test(
      message || "",
    );
  const errors: string[] = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabaseAdmin
      .from("locations")
      .update(updates)
      .eq("id", locationId);
    if (!error) return null;
    errors.push(error.message);
    if (!missingColumn(error.message)) break;
    const match = error.message.match(/'([^']+)'|column "?([a-zA-Z0-9_]+)"?/);
    const column = match?.[1] || match?.[2];
    if (column && updates[column] !== undefined) delete updates[column];
    else {
      const optional = [
        "gallery",
        "photos",
        "image_gallery",
        "images",
        "gallery_images",
        "image_url",
        "main_image",
      ].find((key) => updates[key] !== undefined);
      if (optional) delete updates[optional];
      else break;
    }
  }
  return errors.join("; ");
}
