import "server-only";

import { platformCoreApiConfigured, readCrmOpportunityPageViaCoreApi } from "@/lib/aws/core-api";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CRM_PIPELINES, type PipelineKey } from "../pipelines";
import { normalizeOpportunityPipeline } from "./pipeline-normalization";
import { forecastTotals, opportunityHealth } from "./forecasting";
import type { OpportunityRecord } from "./types";

type OpportunityListInput = {
  pipeline?: string;
  stage?: string;
  forecast?: string;
  risk?: string;
  search?: string;
  view?: string;
  page?: number;
  account_id?: string;
  contact_id?: string;
  location_id?: string;
  opportunity_id?: string;
};

function pipelineCountsFromKeys(keys: Array<string | null | undefined>) {
  return [
    { key: "all", label: "All", count: keys.length },
    ...Object.keys(CRM_PIPELINES).map((key) => ({
      key,
      label: key.replaceAll("_", " "),
      count: keys.filter((value) => value === key).length,
    })),
    { key: "unassigned", label: "Unassigned Pipeline", count: keys.filter((value) => !value).length },
    {
      key: "legacy",
      label: "Legacy Pipeline",
      count: keys.filter((value) => value && !(value in CRM_PIPELINES)).length,
    },
  ];
}

function stagePipelineFor(filter: string) {
  return (
    filter === "all"
      || filter === "unassigned"
      || filter === "legacy"
      || filter === "unknown"
      ? "reserve_pro"
      : filter
  ) as PipelineKey;
}

export async function loadOpportunityPage(input: OpportunityListInput) {
  const page = Math.max(1, input.page ?? 1);
  const size = input.view === "board" ? 250 : 25;
  const normalizedPipeline = normalizeOpportunityPipeline(input.pipeline);
  const stagePipeline = stagePipelineFor(normalizedPipeline.filter);
  const pipelineValues = normalizedPipeline.storageValues.filter(Boolean) as string[];
  const pipelineMode = normalizedPipeline.filter === "all"
    ? "all"
    : normalizedPipeline.filter === "unassigned"
      ? "unassigned"
      : "values";

  if (platformCoreApiConfigured() && (pipelineMode !== "values" || pipelineValues.length > 0)) {
    try {
      const core = await readCrmOpportunityPageViaCoreApi({
        page,
        size,
        pipelineMode,
        pipelineValues,
        stagePipeline,
        stage: input.stage,
        forecast: input.forecast,
        risk: input.risk,
        search: input.search,
        accountId: input.account_id,
        contactId: input.contact_id,
        locationId: input.location_id,
        opportunityId: input.opportunity_id,
        selectorAccountId: input.account_id,
      });
      const rows = core.rows as unknown as OpportunityRecord[];
      return {
        result: {
          rows: rows.map((opportunity: any) => ({
            ...opportunity,
            normalizedPipeline: normalizeOpportunityPipeline(opportunity.pipeline_key),
            health: opportunityHealth(opportunity),
          })),
          count: core.count,
          page,
          size,
          stages: core.stages,
          pipelineCounts: pipelineCountsFromKeys(core.pipelineKeys),
          totals: forecastTotals(rows),
        },
        selectors: core.selectors,
        source: "aws-core" as const,
      };
    } catch (error) {
      console.warn(
        "[crm-opportunities] Core API read failed; using local fallback",
        error instanceof Error ? error.message : "unknown_error",
      );
    }
  }

  const [result, selectors] = await Promise.all([
    listOpportunities(input),
    listOpportunitySelectors({ account_id: input.account_id }),
  ]);
  return { result, selectors, source: "local-fallback" as const };
}

export async function listOpportunities(input: OpportunityListInput) {
  const page = Math.max(1, input.page ?? 1);
  const size = input.view === "board" ? 250 : 25;
  const normalizedPipeline = normalizeOpportunityPipeline(input.pipeline);
  let query = supabaseAdmin
    .from("crm_opportunities")
    .select("*,crm_accounts(id,name),locations:primary_location_id(id,name),crm_tasks(count),crm_opportunity_contacts(count)", { count: "exact" })
    .is("archived_at", null)
    .order("last_stage_changed_at", { ascending: false })
    .range((page - 1) * size, page * size - 1);

  if (normalizedPipeline.filter !== "all") {
    if (normalizedPipeline.filter === "unassigned") query = query.is("pipeline_key", null);
    else query = query.in("pipeline_key", normalizedPipeline.storageValues.filter(Boolean) as string[]);
  }
  if (input.stage) query = query.eq("stage", input.stage);
  if (input.forecast) query = query.eq("forecast_category", input.forecast);
  if (input.risk) query = query.eq("risk_level", input.risk);
  if (input.account_id) query = query.eq("account_id", input.account_id);
  if (input.contact_id) query = query.eq("primary_contact_id", input.contact_id);
  if (input.location_id) query = query.eq("primary_location_id", input.location_id);
  if (input.opportunity_id) query = query.eq("id", input.opportunity_id);
  if (input.search) query = query.ilike("name", `%${input.search.replace(/[%_]/g, "\\$&")}%`);

  const stagePipeline = stagePipelineFor(normalizedPipeline.filter);
  const [{ data, error, count }, stages, pipelineCounts] = await Promise.all([
    query,
    getPipelineStages(stagePipeline),
    listOpportunityPipelineCounts(input),
  ]);
  if (error) throw error;
  const rows = (data ?? []) as unknown as OpportunityRecord[];
  return {
    rows: rows.map((opportunity: any) => ({
      ...opportunity,
      normalizedPipeline: normalizeOpportunityPipeline(opportunity.pipeline_key),
      health: opportunityHealth(opportunity),
    })),
    count: count ?? 0,
    page,
    size,
    stages,
    pipelineCounts,
    totals: forecastTotals(rows),
  };
}

export async function getPipelineStages(pipeline: PipelineKey) {
  const { data, error } = await supabaseAdmin
    .from("crm_pipeline_stages")
    .select("*,crm_pipelines!inner(pipeline_key)")
    .eq("crm_pipelines.pipeline_key", pipeline)
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

export async function getOpportunityDetail(id: string) {
  const [opportunity, products, contacts, stages, history, fieldHistory, tasks, activities] = await Promise.all([
    supabaseAdmin
      .from("crm_opportunities")
      .select("*,crm_accounts(*),locations:primary_location_id(id,name,address,city,state),crm_contacts:primary_contact_id(*)")
      .eq("id", id)
      .is("archived_at", null)
      .single(),
    supabaseAdmin.from("crm_opportunity_products").select("*").eq("opportunity_id", id).limit(100),
    supabaseAdmin.from("crm_opportunity_contacts").select("*,crm_contacts(*)").eq("opportunity_id", id).limit(100),
    supabaseAdmin.from("crm_opportunity_stage_history").select("*").eq("opportunity_id", id).order("entered_at"),
    supabaseAdmin.from("crm_opportunity_stage_history").select("*").eq("opportunity_id", id).order("entered_at", { ascending: false }).limit(100),
    supabaseAdmin.from("crm_opportunity_history").select("*").eq("opportunity_id", id).order("changed_at", { ascending: false }).limit(100),
    supabaseAdmin.from("crm_tasks").select("*").eq("opportunity_id", id).is("archived_at", null).order("due_at").limit(100),
    supabaseAdmin.from("crm_activities").select("*").eq("opportunity_id", id).order("occurred_at", { ascending: false }).limit(100),
  ]);
  if (opportunity.error) throw opportunity.error;
  return {
    opportunity: opportunity.data,
    products: products.data ?? [],
    contacts: contacts.data ?? [],
    stages: stages.data ?? [],
    history: history.data ?? [],
    fieldHistory: fieldHistory.data ?? [],
    tasks: tasks.data ?? [],
    activities: activities.data ?? [],
  };
}

export async function listOpportunitySelectors(input: { account_id?: string; q?: string } = {}) {
  let contacts = supabaseAdmin.from("crm_contacts").select("id,full_name,email").order("full_name").limit(100);
  let locations = supabaseAdmin.from("locations").select("id,name,city,state").order("name").limit(100);
  if (input.account_id) {
    contacts = supabaseAdmin
      .from("crm_account_contacts")
      .select("crm_contacts(id,full_name,email)")
      .eq("account_id", input.account_id)
      .eq("is_active", true)
      .limit(100) as any;
    locations = supabaseAdmin
      .from("crm_account_locations")
      .select("locations(id,name,city,state)")
      .eq("account_id", input.account_id)
      .eq("status", "active")
      .limit(100) as any;
  }
  const [accounts, c, l] = await Promise.all([
    supabaseAdmin.from("crm_accounts").select("id,name").order("name").limit(100),
    contacts,
    locations,
  ]);
  const unwrap = (row: any, key: string) => row?.[key] ?? row;
  return {
    accounts: accounts.data ?? [],
    contacts: (c.data ?? []).map((row: any) => unwrap(row, "crm_contacts")),
    locations: (l.data ?? []).map((row: any) => unwrap(row, "locations")),
  };
}

export async function listOpportunityPipelineCounts(
  input: { account_id?: string; contact_id?: string; location_id?: string } = {},
) {
  let query = supabaseAdmin.from("crm_opportunities").select("pipeline_key").is("archived_at", null);
  if (input.account_id) query = query.eq("account_id", input.account_id);
  if (input.contact_id) query = query.eq("primary_contact_id", input.contact_id);
  if (input.location_id) query = query.eq("primary_location_id", input.location_id);
  const { data, error } = await query;
  if (error) throw error;
  return pipelineCountsFromKeys((data ?? []).map((row: any) => row.pipeline_key));
}

export async function getForecast(input: { start: string; end: string; pipeline?: string }) {
  let query = supabaseAdmin
    .from("crm_opportunities")
    .select("*")
    .gte("expected_close_date", input.start)
    .lte("expected_close_date", input.end)
    .is("archived_at", null);
  if (input.pipeline) query = query.eq("pipeline_key", input.pipeline);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data as OpportunityRecord[];
  const { data: snapshots } = await supabaseAdmin
    .from("crm_forecast_snapshots")
    .select("*")
    .gte("snapshot_date", input.start)
    .lte("snapshot_date", input.end)
    .order("snapshot_date");
  return { rows, totals: forecastTotals(rows), snapshots: snapshots ?? [] };
}
