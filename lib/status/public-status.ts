import "server-only";

import { createClient } from "@supabase/supabase-js";

export type PublicStatusTone =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "maintenance"
  | "no_data";

export type PublicStatusDay = {
  date: string;
  status: PublicStatusTone;
};

export type PublicStatusComponent = {
  slug: string;
  label: string;
  group: string;
  status: PublicStatusTone;
  history: PublicStatusDay[];
  operationalPercent: number | null;
};

export type PublicStatusIncident = {
  key: string;
  title: string;
  detail: string;
  state: "open" | "recovered";
  createdAt: string;
};

export type PublicStatusSummary = {
  generatedAt: string;
  overallStatus: PublicStatusTone;
  components: PublicStatusComponent[];
  incidents: PublicStatusIncident[];
};

type ReleaseRow = {
  release_id: string;
  surface: string;
  state: string;
  updated_at: string;
};

type ReleaseEventRow = {
  release_id: string;
  new_state: string | null;
  created_at: string;
};

type IncidentRow = {
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const COMPONENTS = [
  { slug: "website", label: "Website", group: "TheOutHaven", surfaces: ["consumer"], incidentKeys: ["production_outage"] },
  { slug: "search", label: "Search & Recommendations", group: "Search & Discovery", surfaces: ["consumer"], incidentKeys: ["production_outage"] },
  { slug: "business", label: "Business Dashboard", group: "Business", surfaces: ["business"], incidentKeys: [] },
  { slug: "reserve", label: "Reservation Platform", group: "Reserve", surfaces: ["reserve", "reserve-api"], incidentKeys: [] },
  { slug: "mobile", label: "Mobile App Services", group: "Mobile", surfaces: ["mobile-ios", "mobile-runtime-patch"], incidentKeys: [] },
  { slug: "workers", label: "Background Services", group: "Platform Services", surfaces: ["workers"], incidentKeys: ["critical_cron_failures"] },
] as const;

const PUBLIC_INCIDENT_KEYS = new Set([
  "production_outage",
  "critical_cron_failures",
]);

function toneForReleaseState(state: string | null | undefined): PublicStatusTone {
  switch (state) {
    case "DEGRADED":
      return "degraded";
    case "ROLLING_BACK":
      return "partial_outage";
    case "FAILED":
      return "major_outage";
    case "STABLE":
    case "ROLLED_BACK":
    case "PROMOTING":
    case "CANARY":
    case "CANDIDATE":
    case "VALIDATING":
    case "BUILDING":
      return "operational";
    default:
      return "no_data";
  }
}

function severity(tone: PublicStatusTone) {
  switch (tone) {
    case "major_outage":
      return 5;
    case "partial_outage":
      return 4;
    case "degraded":
      return 3;
    case "maintenance":
      return 2;
    case "operational":
      return 1;
    default:
      return 0;
  }
}

function worse(a: PublicStatusTone, b: PublicStatusTone) {
  return severity(a) >= severity(b) ? a : b;
}

function isoDay(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function lastDays(count: number) {
  const today = new Date();
  const rows: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
    rows.push(day.toISOString().slice(0, 10));
  }
  return rows;
}

function publicIncident(row: IncidentRow): PublicStatusIncident | null {
  const metadata = row.metadata || {};
  const key = String(metadata.incident_key || "");
  if (!PUBLIC_INCIDENT_KEYS.has(key)) return null;
  const state = String(metadata.state || "").toLowerCase() === "open" ? "open" : "recovered";
  return {
    key,
    title: String(metadata.title || row.message || "Service incident"),
    detail: String(metadata.detail || ""),
    state,
    createdAt: row.created_at,
  };
}

export async function getPublicStatusSummary(): Promise<PublicStatusSummary> {
  const generatedAt = new Date().toISOString();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return {
      generatedAt,
      overallStatus: "no_data",
      components: COMPONENTS.map((component) => ({
        slug: component.slug,
        label: component.label,
        group: component.group,
        status: "no_data",
        history: lastDays(90).map((date) => ({ date, status: "no_data" as const })),
        operationalPercent: null,
      })),
      incidents: [],
    };
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [releaseResult, eventResult, incidentResult] = await Promise.all([
    db
      .from("platform_releases")
      .select("release_id,surface,state,updated_at")
      .eq("environment", "production")
      .order("updated_at", { ascending: false })
      .limit(250),
    db
      .from("platform_release_events")
      .select("release_id,new_state,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(5000),
    db
      .from("admin_system_logs")
      .select("message,metadata,created_at")
      .eq("category", "critical_alert")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  if (releaseResult.error || eventResult.error || incidentResult.error) {
    console.error("public_status_read_failed", {
      releases: releaseResult.error?.message,
      events: eventResult.error?.message,
      incidents: incidentResult.error?.message,
    });
  }

  const releases = (releaseResult.data || []) as ReleaseRow[];
  const events = (eventResult.data || []) as ReleaseEventRow[];
  const incidentRows = (incidentResult.data || []) as IncidentRow[];
  const incidentHistory = incidentRows.map(publicIncident).filter((row): row is PublicStatusIncident => Boolean(row));

  const latestIncidentByKey = new Map<string, PublicStatusIncident>();
  for (const incident of incidentHistory) {
    if (!latestIncidentByKey.has(incident.key)) latestIncidentByKey.set(incident.key, incident);
  }
  const activeIncidents = [...latestIncidentByKey.values()].filter((incident) => incident.state === "open");

  const latestReleaseBySurface = new Map<string, ReleaseRow>();
  const releaseSurfaceById = new Map<string, string>();
  for (const release of releases) {
    releaseSurfaceById.set(release.release_id, release.surface);
    if (!latestReleaseBySurface.has(release.surface)) latestReleaseBySurface.set(release.surface, release);
  }

  const days = lastDays(90);

  const components = COMPONENTS.map((definition): PublicStatusComponent => {
    let current: PublicStatusTone = "no_data";
    for (const surface of definition.surfaces) {
      const release = latestReleaseBySurface.get(surface);
      current = worse(current, toneForReleaseState(release?.state));
    }

    for (const key of definition.incidentKeys) {
      const incident = latestIncidentByKey.get(key);
      if (incident?.state === "open") current = worse(current, "major_outage");
    }

    const byDay = new Map<string, PublicStatusTone>();

    for (const event of events) {
      const surface = releaseSurfaceById.get(event.release_id);
      if (!surface || !definition.surfaces.includes(surface as never)) continue;
      const day = isoDay(event.created_at);
      byDay.set(day, worse(byDay.get(day) || "no_data", toneForReleaseState(event.new_state)));
    }

    for (const incident of incidentHistory) {
      if (!definition.incidentKeys.includes(incident.key as never)) continue;
      const day = isoDay(incident.createdAt);
      if (incident.state === "open") byDay.set(day, worse(byDay.get(day) || "no_data", "major_outage"));
      else if (!byDay.has(day)) byDay.set(day, "operational");
    }

    const history = days.map((date) => ({ date, status: byDay.get(date) || "no_data" as PublicStatusTone }));
    const monitored = history.filter((day) => day.status !== "no_data");
    const operational = monitored.filter((day) => day.status === "operational").length;
    const operationalPercent = monitored.length ? Number(((operational / monitored.length) * 100).toFixed(2)) : null;

    return {
      slug: definition.slug,
      label: definition.label,
      group: definition.group,
      status: current,
      history,
      operationalPercent,
    };
  });

  const overallStatus = components.reduce<PublicStatusTone>((status, component) => worse(status, component.status), "no_data");

  return {
    generatedAt,
    overallStatus,
    components,
    incidents: activeIncidents,
  };
}
