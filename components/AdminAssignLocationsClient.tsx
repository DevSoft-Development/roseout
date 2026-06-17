"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LocationRow = Record<string, any>;

function locName(location: LocationRow) {
  return (
    location.display_name ||
    location.name ||
    location.location_name ||
    location.restaurant_name ||
    location.activity_name ||
    "Untitled location"
  );
}

function normalize(value: unknown) {
  return String(value || "").trim();
}

function statusLabel(value: unknown) {
  const raw = normalize(value);
  return raw ? raw.replace(/_/g, " ") : "—";
}

function buildQuery(params: Record<string, string>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const clean = normalize(value);
    if (clean && clean !== "all") searchParams.set(key, clean);
  });

  return searchParams.toString();
}

export default function AdminAssignLocationsClient({
  initialLocations,
  teamMembers,
  initialFilters,
}: {
  initialLocations: LocationRow[];
  teamMembers: any[];
  initialFilters?: Record<string, string>;
}) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  const [locations, setLocations] = useState<LocationRow[]>(initialLocations || []);
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [searchMsg, setSearchMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useState({
    q: initialFilters?.q || currentSearchParams.get("q") || "",
    partnerSalesStatus:
      initialFilters?.partnerSalesStatus || currentSearchParams.get("partnerSalesStatus") || "all",
    claimOutreachStatus:
      initialFilters?.claimOutreachStatus || currentSearchParams.get("claimOutreachStatus") || "all",
    reservationPortalStatus:
      initialFilters?.reservationPortalStatus || currentSearchParams.get("reservationPortalStatus") || "all",
    reservationEmbedStatus:
      initialFilters?.reservationEmbedStatus || currentSearchParams.get("reservationEmbedStatus") || "all",
    discoveryProfileStatus:
      initialFilters?.discoveryProfileStatus || currentSearchParams.get("discoveryProfileStatus") || "all",
    planStatus: initialFilters?.planStatus || currentSearchParams.get("planStatus") || "all",
  });

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function searchLocations() {
    setSearchMsg("Searching...");
    setSelected([]);

    const query = buildQuery({ ...filters, limit: "50" });

    try {
      const response = await fetch(`/api/admin/workspace/assign-locations/search?${query}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Search failed.");
      }

      setLocations(Array.isArray(data.locations) ? data.locations : []);
      setSearchMsg(`${Array.isArray(data.locations) ? data.locations.length : 0} location(s) found.`);

      startTransition(() => {
        router.replace(`/admin/dashboard/my-workspace/assign-locations${query ? `?${query}` : ""}`, {
          scroll: false,
        });
      });
    } catch (error) {
      setSearchMsg(error instanceof Error ? error.message : "Search failed.");
    }
  }

  async function assign(formData: FormData) {
    setMsg("Assigning...");

    const response = await fetch("/api/admin/workspace/assign-locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationIds: selected,
        assignedTo: formData.get("assignedTo"),
        priority: formData.get("priority"),
        reason: formData.get("reason"),
        notes: formData.get("notes"),
        tag: formData.get("tag"),
        campaign: formData.get("campaign"),
        nextActionType: formData.get("nextActionType"),
        nextActionNote: formData.get("nextActionNote"),
        nextActionDueAt: formData.get("nextActionDueAt"),
      }),
    });

    const data = await response.json().catch(() => ({}));
    setMsg(response.ok ? `Assigned ${data.count || selected.length} location(s).` : data.error || "Assignment failed.");

    if (response.ok) setSelected([]);
  }

  function toggleLocation(locationId: string, checked: boolean) {
    setSelected((current) => {
      if (checked) return Array.from(new Set([...current, locationId]));
      return current.filter((id) => id !== locationId);
    });
  }

  function selectAllVisible() {
    setSelected(Array.from(new Set(locations.map((location) => String(location.id)).filter(Boolean))));
  }

  function clearSelected() {
    setSelected([]);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
          <input
            value={filters.q}
            onChange={(event) => updateFilter("q", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                searchLocations();
              }
            }}
            placeholder="Search name, address, phone, borough, neighborhood, city, category"
            className="min-w-0 rounded-2xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-rose-300/60"
          />

          <select
            value={filters.partnerSalesStatus}
            onChange={(event) => updateFilter("partnerSalesStatus", event.target.value)}
            className="min-w-0 rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
          >
            <option value="all">All sales statuses</option>
            {[
              "target",
              "needs_outreach",
              "contacted",
              "interested",
              "claim_link_sent",
              "claim_pending",
              "claim_approved",
              "demo_setup",
              "payment_pending",
              "active_partner",
              "reservation_ready",
              "at_risk",
              "not_interested",
              "churned",
            ].map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>

          <select
            value={filters.claimOutreachStatus}
            onChange={(event) => updateFilter("claimOutreachStatus", event.target.value)}
            className="min-w-0 rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
          >
            <option value="all">All claim statuses</option>
            {["not_sent", "sent", "viewed", "started", "submitted", "approved", "rejected", "expired"].map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>

          <select
            value={filters.planStatus}
            onChange={(event) => updateFilter("planStatus", event.target.value)}
            className="min-w-0 rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
          >
            <option value="all">All plan statuses</option>
            {["active", "trialing", "past_due", "canceled", "inactive", "comped"].map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>

          <select
            value={filters.reservationPortalStatus}
            onChange={(event) => updateFilter("reservationPortalStatus", event.target.value)}
            className="min-w-0 rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
          >
            <option value="all">All portal statuses</option>
            {["not_enabled", "needs_setup", "enabled", "tested", "live", "paused", "issue"].map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>

          <select
            value={filters.reservationEmbedStatus}
            onChange={(event) => updateFilter("reservationEmbedStatus", event.target.value)}
            className="min-w-0 rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
          >
            <option value="all">All embed statuses</option>
            {["not_sent", "generated", "sent", "installed", "tested", "needs_help", "not_needed"].map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>

          <select
            value={filters.discoveryProfileStatus}
            onChange={(event) => updateFilter("discoveryProfileStatus", event.target.value)}
            className="min-w-0 rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
          >
            <option value="all">All discovery statuses</option>
            {["needs_review", "needs_photos", "needs_tags", "needs_hours", "ready", "paused", "issue"].map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={searchLocations}
            disabled={isPending}
            className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {isPending ? "Searching..." : "Search / Filter"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-white/55">
          <button type="button" onClick={selectAllVisible} className="rounded-full bg-white/10 px-3 py-2 text-white">
            Select visible
          </button>
          <button type="button" onClick={clearSelected} className="rounded-full bg-white/10 px-3 py-2 text-white">
            Clear selected
          </button>
          {searchMsg ? <span className="px-1 py-2">{searchMsg}</span> : null}
        </div>
      </section>

      <form action={assign} className="rounded-3xl border border-rose-300/20 bg-rose-500/10 p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <select name="assignedTo" className="rounded-full border border-white/10 bg-black px-4 py-3 text-white">
            <option value="unassigned">Unassigned queue</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label} · {member.team_type}
              </option>
            ))}
          </select>

          <select name="priority" defaultValue="normal" className="rounded-full border border-white/10 bg-black px-4 py-3 text-white">
            {["low", "normal", "high", "urgent"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>

          <select name="nextActionType" className="rounded-full border border-white/10 bg-black px-4 py-3 text-white">
            {[
              "call_owner",
              "send_instagram_dm",
              "send_email",
              "send_claim_link",
              "follow_up_claim",
              "schedule_demo",
              "setup_reservation_portal",
              "send_embed_code",
              "complete_discovery_profile",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>

          <input name="campaign" defaultValue="partner_launch" className="rounded-full border border-white/10 bg-black px-4 py-3 text-white" />

          <select name="tag" className="rounded-full border border-white/10 bg-black px-4 py-3 text-white">
            {["partner_launch", "launch_pilot", "reservation_setup", "embed_follow_up", "discovery_cleanup"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>

          <input name="nextActionDueAt" type="datetime-local" className="rounded-full border border-white/10 bg-black px-4 py-3 text-white" />

          <input name="reason" placeholder="Assignment reason" className="rounded-full border border-white/10 bg-black px-4 py-3 text-white md:col-span-3" />

          <textarea name="nextActionNote" placeholder="Next action note" className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white md:col-span-3" />

          <textarea name="notes" placeholder="Internal assignment notes" className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white md:col-span-3" />
        </div>

        <button disabled={!selected.length} className="mt-4 rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:opacity-40">
          Bulk assign selected ({selected.length})
        </button>

        {msg ? <p className="mt-3 text-sm font-bold text-white/70">{msg}</p> : null}
      </form>

      <section className="max-w-full overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.04] p-3">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="text-xs uppercase tracking-widest text-white/45">
            <tr>
              {["Select", "Location", "Address", "Phone", "Category", "Area", "Claim", "Partner", "Plan / Portal", "Last activity"].map((heading) => (
                <th className="px-3 py-3" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {locations.map((location) => (
              <tr key={location.id} className="border-t border-white/10">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(String(location.id))}
                    onChange={(event) => toggleLocation(String(location.id), event.target.checked)}
                  />
                </td>
                <td className="px-3 py-3 font-black text-rose-100">{locName(location)}</td>
                <td className="px-3 py-3 text-white/60">{location.address || "—"}</td>
                <td className="px-3 py-3 text-white/60">{location.display_phone || location.phone || location.phone_number || "—"}</td>
                <td className="px-3 py-3 text-white/60">{location.display_category || location.category || location.location_type || "—"}</td>
                <td className="px-3 py-3 text-white/60">
                  {[location.neighborhood, location.borough, location.city].filter(Boolean).join(" / ") || "—"}
                </td>
                <td className="px-3 py-3 text-white/60">{statusLabel(location.claim_status || location.claim_outreach_status)}</td>
                <td className="px-3 py-3 text-white/60">{statusLabel(location.partner_sales_status)}</td>
                <td className="px-3 py-3 text-white/60">
                  {statusLabel(location.plan_status)} / {statusLabel(location.reservation_portal_status)}
                </td>
                <td className="px-3 py-3 text-white/60">
                  {location.updated_at ? new Date(location.updated_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!locations.length ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm font-bold text-white/50">
            No locations found for these filters.
          </div>
        ) : null}
      </section>
    </div>
  );
}
