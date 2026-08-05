"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ASSIGNMENT_WORK_TYPES } from "@/lib/team-assignment-utils";

type LocationRow = Record<string, any>;
type Facets = { markets: string[]; cities: string[]; boroughs: string[]; neighborhoods: string[]; states: string[] };

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildQuery(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== "all") params.set(key, value);
  });
  params.set("limit", "100");
  return params;
}

export default function AdminAssignLocationsClient({
  initialLocations,
  initialCount,
  initialScope,
  teamMembers,
  initialFilters,
  facets,
}: {
  initialLocations: LocationRow[];
  initialCount: number;
  initialScope: string;
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
  const [filters, setFilters] = useState({
    q: initialFilters.q || "",
    market: initialFilters.market || "all",
    city: initialFilters.city || "all",
    town: initialFilters.town || "all",
    borough: initialFilters.borough || "all",
    neighborhood: initialFilters.neighborhood || "all",
    state: initialFilters.state || "all",
  });
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function searchLocations() {
    setMessage("Loading matching locations...");
    setSelected([]);
    const params = buildQuery(filters);
    const response = await fetch(`/api/admin/workspace/assign-locations/search?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "Could not load locations.");
      return;
    }
    setLocations(payload.locations || []);
    setMatchCount(payload.count || 0);
    setScopeLabel(payload.scope || "Selected locations");
    setMessage(`${payload.count || 0} matching location(s). ${payload.limited ? "Showing the first 100." : ""}`);
    startTransition(() => router.replace(`/admin/dashboard/team/assignments?${params.toString()}`, { scroll: false }));
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
    setMessage(`Assigned ${payload.assignedCount} location(s) and created ${payload.taskCount} My Work task(s).`);
    setMyWorkHref(payload.myWorkHref || "/admin/dashboard/crm/my-work?view=my-queue");
  }

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">1. Choose an area or locations</h2>
            <p className="mt-1 text-sm text-white/55">Use one or several filters, preview the matches, then select specific rows or assign every match.</p>
          </div>
          <span className="rounded-full bg-rose-500/15 px-3 py-2 text-sm font-bold text-rose-100">{scopeLabel}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input value={filters.q} onChange={(e) => updateFilter("q", e.target.value)} placeholder="Search name or address" className="rounded-xl border border-white/10 bg-black px-4 py-3" />
          <select value={filters.market} onChange={(e) => updateFilter("market", e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3"><option value="all">All markets</option>{facets.markets.map((v) => <option key={v}>{v}</option>)}</select>
          <select value={filters.city} onChange={(e) => updateFilter("city", e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3"><option value="all">All cities / towns</option>{facets.cities.map((v) => <option key={v}>{v}</option>)}</select>
          <select value={filters.borough} onChange={(e) => updateFilter("borough", e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3"><option value="all">All boroughs</option>{facets.boroughs.map((v) => <option key={v}>{v}</option>)}</select>
          <select value={filters.neighborhood} onChange={(e) => updateFilter("neighborhood", e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3"><option value="all">All neighborhoods</option>{facets.neighborhoods.map((v) => <option key={v}>{v}</option>)}</select>
          <select value={filters.state} onChange={(e) => updateFilter("state", e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3"><option value="all">All states</option>{facets.states.map((v) => <option key={v}>{v}</option>)}</select>
          <button type="button" onClick={searchLocations} disabled={isPending} className="rounded-xl bg-rose-600 px-5 py-3 font-black disabled:opacity-50">{isPending ? "Loading..." : "Preview matching locations"}</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelected(locations.map((row) => String(row.id)))} className="rounded-full border border-white/15 px-3 py-2 text-sm font-bold">Select visible ({locations.length})</button>
          <button type="button" onClick={() => setSelected([])} className="rounded-full border border-white/15 px-3 py-2 text-sm font-bold">Clear</button>
          <label className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-sm font-bold"><input type="radio" checked={assignmentMode === "selected"} onChange={() => setAssignmentMode("selected")} /> Selected only ({selected.length})</label>
          <label className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-sm font-bold"><input type="radio" checked={assignmentMode === "all_matching"} onChange={() => setAssignmentMode("all_matching")} /> All matching ({matchCount})</label>
        </div>
      </section>

      <form action={assign} className="rounded-3xl border border-rose-300/20 bg-rose-500/10 p-5">
        <h2 className="text-xl font-black">2. Assign the work</h2>
        <p className="mt-1 text-sm text-white/60">The selected team member receives one location-linked task per assignment in CRM → My Work.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm font-bold"><span>Team member</span><select required name="assignedTo" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3"><option value="">Choose a team member</option>{teamMembers.map((member) => <option key={member.id} value={member.id}>{member.display_name} · {label(member.team_type || "team")}</option>)}</select></label>
          <label className="space-y-1 text-sm font-bold"><span>Work type</span><select name="workType" defaultValue="follow_up" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3">{ASSIGNMENT_WORK_TYPES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
          <label className="space-y-1 text-sm font-bold"><span>Priority</span><select name="priority" defaultValue="normal" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3">{["low", "normal", "high", "urgent"].map((value) => <option key={value}>{label(value)}</option>)}</select></label>
          <label className="space-y-1 text-sm font-bold"><span>Due date</span><input name="dueAt" type="datetime-local" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3" /></label>
          <label className="space-y-1 text-sm font-bold md:col-span-2"><span>Assignment reason</span><input name="reason" placeholder="Example: Queens launch outreach" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3" /></label>
          <label className="space-y-1 text-sm font-bold md:col-span-2"><span>Campaign</span><input name="campaign" defaultValue="team_assignment" className="w-full rounded-xl border border-white/10 bg-black px-4 py-3" /></label>
          <label className="space-y-1 text-sm font-bold md:col-span-4"><span>Instructions</span><textarea name="notes" placeholder="What should the team member complete?" className="min-h-24 w-full rounded-xl border border-white/10 bg-black px-4 py-3" /></label>
        </div>
        <button disabled={assignmentMode === "selected" && !selected.length} className="mt-4 rounded-xl bg-white px-5 py-3 font-black text-black disabled:opacity-40">Assign and create My Work tasks</button>
        {message ? <p className="mt-3 rounded-xl bg-black/25 p-3 text-sm font-bold">{message}</p> : null}
        {myWorkHref ? <Link href={myWorkHref} className="mt-3 inline-flex rounded-xl bg-rose-600 px-4 py-3 font-black">Open My Work →</Link> : null}
      </form>

      <section className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.04] p-3">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-white/45"><tr>{["Select", "Location", "Address", "Market", "City / Town", "Borough", "Neighborhood", "Category"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
          <tbody>{locations.map((location) => <tr key={location.id} className="border-t border-white/10"><td className="px-3 py-3"><input type="checkbox" checked={selectedSet.has(String(location.id))} onChange={() => toggle(String(location.id))} /></td><td className="px-3 py-3 font-black text-rose-100">{location.display_name}</td><td className="px-3 py-3 text-white/60">{location.address || "—"}</td><td className="px-3 py-3 text-white/60">{location.market || "—"}</td><td className="px-3 py-3 text-white/60">{location.city || "—"}</td><td className="px-3 py-3 text-white/60">{location.borough || "—"}</td><td className="px-3 py-3 text-white/60">{location.neighborhood || "—"}</td><td className="px-3 py-3 text-white/60">{location.category || location.location_type || "—"}</td></tr>)}</tbody>
        </table>
        {!locations.length ? <p className="p-8 text-center text-white/60">No locations match this area.</p> : null}
      </section>
    </div>
  );
}
