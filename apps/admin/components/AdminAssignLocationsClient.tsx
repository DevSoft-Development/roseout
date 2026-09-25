"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ASSIGNMENT_WORK_TYPES } from "@/lib/team-assignment-utils";

type LocationRow = Record<string, any>;
type Facets = {
  markets: string[];
  cities: string[];
  boroughs: string[];
  neighborhoods: string[];
  zips: string[];
  states: string[];
  territories: Array<{ id: string; name: string; borough: string | null }>;
};

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildQuery(filters: Record<string, string>, page: number, limit: number) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== "all") params.set(key, value);
  });
  params.set("page", String(page));
  params.set("limit", String(limit));
  return params;
}

export default function AdminAssignLocationsClient({
  initialLocations,
  initialCount,
  initialScope,
  initialPage,
  initialPageSize,
  initialTotalPages,
  teamMembers,
  initialFilters,
  facets,
}: {
  initialLocations: LocationRow[];
  initialCount: number;
  initialScope: string;
  initialPage: number;
  initialPageSize: number;
  initialTotalPages: number;
  teamMembers: any[];
  initialFilters: Record<string, string>;
  facets: Facets;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [locations, setLocations] = useState(initialLocations || []);
  const [matchCount, setMatchCount] = useState(initialCount || 0);
  const [scopeLabel, setScopeLabel] = useState(initialScope || "Selected locations");
  const [selected, setSelected] = useState<string[]>([]);
  const [assignmentMode, setAssignmentMode] = useState<"selected" | "all_matching">("selected");
  const [message, setMessage] = useState("");
  const [myWorkHref, setMyWorkHref] = useState("");
  const [page, setPage] = useState(initialPage || 1);
  const [pageSize, setPageSize] = useState(initialPageSize || 100);
  const [totalPages, setTotalPages] = useState(initialTotalPages || 1);
  const [department, setDepartment] = useState("all");
  const [filters, setFilters] = useState({
    q: initialFilters.q || "",
    market: initialFilters.market || "all",
    state: initialFilters.state || "all",
    city: initialFilters.city || "all",
    town: initialFilters.town || "all",
    zip: initialFilters.zip || "all",
    borough: initialFilters.borough || "all",
    neighborhood: initialFilters.neighborhood || "all",
    territory: initialFilters.territory || "all",
  });

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const departments = useMemo(
    () => Array.from(new Set(teamMembers.map((member) => String(member.department || member.team_type || "Team")))).sort(),
    [teamMembers],
  );
  const visibleTeamMembers = useMemo(
    () =>
      department === "all"
        ? teamMembers
        : teamMembers.filter(
            (member) => String(member.department || member.team_type || "Team") === department,
          ),
    [department, teamMembers],
  );

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function loadLocations(nextPage = 1, resetSelection = false, nextPageSize = pageSize) {
    setMessage("Loading matching locations...");
    if (resetSelection) setSelected([]);
    const params = buildQuery(filters, nextPage, nextPageSize);
    const response = await fetch(
      `/api/admin/workspace/assign-locations/search?${params.toString()}`,
      { cache: "no-store" },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "Could not load locations.");
      return;
    }
    setLocations(payload.locations || []);
    setMatchCount(payload.count || 0);
    setScopeLabel(payload.scope || "Selected locations");
    setPage(payload.page || nextPage);
    setPageSize(payload.pageSize || nextPageSize);
    setTotalPages(payload.totalPages || 1);
    setMessage(
      `${payload.count || 0} matching location(s). Page ${payload.page || nextPage} of ${payload.totalPages || 1}.`,
    );
    startTransition(() =>
      router.replace(
        `/admin/dashboard/team/assignments?${params.toString()}`,
        { scroll: false },
      ),
    );
  }

  async function assign(formData: FormData) {
    setMessage("Creating assignments and My Work tasks...");
    setMyWorkHref("");
    const response = await fetch("/api/admin/workspace/assign-locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentMode,
        locationIds: selected,
        scope: filters,
        q: filters.q,
        assignedTo: formData.get("assignedTo"),
        workType: formData.get("workType"),
        priority: formData.get("priority"),
        dueAt: formData.get("dueAt") || null,
        reason: formData.get("reason"),
        notes: formData.get("notes"),
        campaign: formData.get("campaign") || "team_assignment",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "Assignment failed.");
      return;
    }
    setSelected([]);
    setMessage(
      `Assigned ${payload.assignedCount} location(s) and created ${payload.taskCount} My Work task(s).`,
    );
    setMyWorkHref(payload.myWorkHref || "/admin/dashboard/crm/my-work?view=my-queue");
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">1. Choose a territory or locations</h2>
            <p className="mt-1 text-sm text-white/55">
              Choose a saved Territory or combine market, state, city/town, ZIP,
              borough, and neighborhood filters. You can assign selected rows or
              every matching location.
            </p>
          </div>
          <span className="rounded-full bg-rose-500/15 px-3 py-2 text-sm font-bold text-rose-100">
            {scopeLabel}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={filters.q}
            onChange={(e) => updateFilter("q", e.target.value)}
            placeholder="Search name, address, ZIP, area"
            className="rounded-xl border border-white/10 bg-black px-4 py-3"
          />
          <select
            value={filters.territory}
            onChange={(e) => updateFilter("territory", e.target.value)}
            className="rounded-xl border border-white/10 bg-black px-4 py-3"
          >
            <option value="all">All territories</option>
            {facets.territories.map((territory) => (
              <option key={territory.id} value={territory.id}>
                {territory.name}{territory.borough ? ` · ${territory.borough}` : ""}
              </option>
            ))}
          </select>
          <select value={filters.market} onChange={(e) => updateFilter("market", e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3">
            <option value="all">All markets</option>
            {facets.markets.map((v) => <option key={v}>{v}</option>)}
          </select>
          <select value={filters.state} onChange={(e) => updateFilter("state", e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3">
            <option value="all">All states</option>
            {facets.states.map((v) => <option key={v}>{v}</option>)}
          </select>
          <select value={filters.city} onChange={(e) => updateFilter("city", e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3">
            <option value="all">All cities / towns</option>
            {facets.cities.map((v) => <option key={v}>{v}</option>)}
          </select>
          <select value={filters.zip} onChange={(e) => updateFilter("zip", e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3">
            <option value="all">All ZIP codes</option>
            {facets.zips.map((v) => <option key={v}>{v}</option>)}
          </select>
          <select value={filters.borough} onChange={(e) => updateFilter("borough", e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3">
            <option value="all">All boroughs</option>
            {facets.boroughs.map((v) => <option key={v}>{v}</option>)}
          </select>
          <select value={filters.neighborhood} onChange={(e) => updateFilter("neighborhood", e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3">
            <option value="all">All neighborhoods</option>
            {facets.neighborhoods.map((v) => <option key={v}>{v}</option>)}
          </select>
          <label className="space-y-1 text-sm font-bold">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const value = Number(e.target.value);
                setPageSize(value);
                void loadLocations(1, false, value);
              }}
              className="w-full rounded-xl border border-white/10 bg-black px-4 py-3"
            >
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="500">500</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadLocations(1, true)}
            disabled={isPending}
            className="rounded-xl bg-rose-600 px-5 py-3 font-black disabled:opacity-50 xl:col-span-3"
          >
            {isPending ? "Loading..." : "Preview matching locations"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelected((current) => Array.from(new Set([...current, ...locations.map((row) => String(row.id))])))} className="rounded-full border border-white/15 px-3 py-2 text-sm font-bold">
            Select visible ({locations.length})
          </button>
          <button type="button" onClick={() => setSelected([])} className="rounded-full border border-white/15 px-3 py-2 text-sm font-bold">
            Clear
          </button>
          <label className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-sm font-bold">
            <input type="radio" checked={assignmentMode === "selected"} onChange={() => setAssignmentMode("selected")} />
            Selected ({selected.length})
          </label>
          <label className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-sm font-bold">
            <input type="radio" checked={assignmentMode === "all_matching"} onChange={() => setAssignmentMode("all_matching")} />
            All matching ({matchCount})
          </label>
        </div>
      </section>

      <form action={assign} className="rounded-3xl border border-rose-300/20 bg-rose-500/10 p-5">
        <h2 className="text-xl font-black">2. Assign the work</h2>
        <p className="mt-1 text-sm text-white/60">
          Choose any department, then a team member. The assignee receives one
          location-linked CRM task per assignment.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm font-bold">
            <span>Department</span>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black px-4 py-3"
            >
              <option value="all">All departments</option>
              {departments.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-bold">
            <span>Team member</span>
            <select required name="assignedTo" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3">
              <option value="">Choose a team member</option>
              {visibleTeamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name} · {member.department || label(member.team_type || "team")}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-bold">
            <span>Work type</span>
            <select name="workType" defaultValue="follow_up" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3">
              {ASSIGNMENT_WORK_TYPES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-bold">
            <span>Priority</span>
            <select name="priority" defaultValue="normal" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3">
              {["low", "normal", "high", "urgent"].map((value) => <option key={value}>{label(value)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-bold">
            <span>Due date</span>
            <input name="dueAt" type="datetime-local" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3" />
          </label>
          <label className="space-y-1 text-sm font-bold md:col-span-2">
            <span>Assignment reason</span>
            <input name="reason" placeholder="Example: Bronx territory outreach" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3" />
          </label>
          <label className="space-y-1 text-sm font-bold">
            <span>Campaign</span>
            <input name="campaign" defaultValue="team_assignment" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3" />
          </label>
          <label className="space-y-1 text-sm font-bold md:col-span-4">
            <span>Instructions</span>
            <textarea name="notes" placeholder="What should the team member complete?" className="min-h-24 w-full rounded-xl border border-white/10 bg-black px-4 py-3" />
          </label>
        </div>
        <button disabled={assignmentMode === "selected" && !selected.length} className="mt-4 rounded-xl bg-white px-5 py-3 font-black text-black disabled:opacity-40">
          Assign and create My Work tasks
        </button>
        {message ? <p className="mt-3 rounded-xl bg-black/25 p-3 text-sm font-bold">{message}</p> : null}
        {myWorkHref ? <Link href={myWorkHref} className="mt-3 inline-flex rounded-xl bg-rose-600 px-4 py-3 font-black">Open My Work →</Link> : null}
      </form>

      <section className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.04] p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2">
          <p className="text-sm font-bold text-white/60">
            Showing page {page} of {totalPages} · {matchCount} matching locations
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => void loadLocations(page - 1, false)}
              className="rounded-xl border border-white/15 px-3 py-2 text-sm font-bold disabled:opacity-30"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => void loadLocations(page + 1, false)}
              className="rounded-xl border border-white/15 px-3 py-2 text-sm font-bold disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-white/45">
            <tr>
              {["Select", "Location", "Address", "Market", "State", "City / Town", "ZIP", "Borough", "Neighborhood", "Category"].map((heading) => (
                <th key={heading} className="px-3 py-3">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locations.map((location) => (
              <tr key={location.id} className="border-t border-white/10">
                <td className="px-3 py-3"><input type="checkbox" checked={selectedSet.has(String(location.id))} onChange={() => toggle(String(location.id))} /></td>
                <td className="px-3 py-3 font-black text-rose-100">{location.display_name}</td>
                <td className="px-3 py-3 text-white/60">{location.address || "—"}</td>
                <td className="px-3 py-3 text-white/60">{location.market || "—"}</td>
                <td className="px-3 py-3 text-white/60">{location.state || "—"}</td>
                <td className="px-3 py-3 text-white/60">{location.city || "—"}</td>
                <td className="px-3 py-3 text-white/60">{location.zip_code || location.postal_code || "—"}</td>
                <td className="px-3 py-3 text-white/60">{location.borough || "—"}</td>
                <td className="px-3 py-3 text-white/60">{location.neighborhood || "—"}</td>
                <td className="px-3 py-3 text-white/60">{location.category || location.location_type || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!locations.length ? <p className="p-8 text-center text-white/60">No locations match this territory.</p> : null}
      </section>
    </div>
  );
}
