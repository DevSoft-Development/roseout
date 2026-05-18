"use client";

import { useEffect, useMemo, useState } from "react";

type Opportunity = {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  google_maps_url: string | null;
  rating: number | string | null;
  review_count: number | string | null;
  primary_category: string | null;
  reservation_discovery_status: string | null;
  reservation_upgrade_reason: string | null;
  reservation_upgrade_detected_at: string | null;
  reservation_outreach_status: string | null;
  reservation_outreach_notes?: string | null;
};

type OpportunitiesResponse = {
  success?: boolean;
  total?: number;
  limit?: number;
  offset?: number;
  nextOffset?: number;
  summary?: Record<string, number>;
  opportunities?: Opportunity[];
  error?: string;
};

const statusOptions = [
  "not_contacted",
  "contacted",
  "interested",
  "not_interested",
  "claimed",
  "onboarded",
];

function prettyStatus(status: string | null | undefined) {
  return (status || "not_contacted").replaceAll("_", " ");
}

function getNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ReservationOpportunitiesClient() {
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [minRating, setMinRating] = useState("");
  const [q, setQ] = useState("");
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const params = useMemo(() => {
    const search = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (city.trim()) search.set("city", city.trim());
    if (state.trim()) search.set("state", state.trim());
    if (category.trim()) search.set("category", category.trim());
    if (status) search.set("status", status);
    if (minRating.trim()) search.set("minRating", minRating.trim());
    if (q.trim()) search.set("q", q.trim());
    return search;
  }, [category, city, limit, minRating, offset, q, state, status]);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/reservation-opportunities?${params.toString()}`,
        { cache: "no-store" },
      );
      const json = (await response.json()) as OpportunitiesResponse;
      setData(json);
      const nextNotes: Record<string, string> = {};
      for (const opportunity of json.opportunities || [])
        nextNotes[opportunity.id] =
          opportunity.reservation_outreach_notes || "";
      setNotes(nextNotes);
      if (!response.ok || json.success === false)
        alert(json.error || "Failed to load opportunities");
    } catch (error) {
      console.error("Failed to load reservation opportunities:", error);
      alert("Failed to load opportunities");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
    // Params intentionally captures filter and pagination state for this report request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function applyFilters() {
    setOffset(0);
    void load();
  }

  function exportCsv() {
    const csvParams = new URLSearchParams(params);
    csvParams.set("export", "csv");
    csvParams.set("limit", "5000");
    window.location.href = `/api/admin/reservation-opportunities?${csvParams.toString()}`;
  }

  async function updateOpportunity(
    opportunity: Opportunity,
    nextStatus: string,
  ) {
    setSavingId(opportunity.id);
    try {
      const response = await fetch(
        `/api/admin/reservation-opportunities/${encodeURIComponent(opportunity.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reservation_outreach_status: nextStatus,
            reservation_outreach_notes: notes[opportunity.id] || "",
          }),
        },
      );
      const json = await response.json();
      if (!response.ok || json.success === false) {
        alert(json.error || "Failed to update outreach status");
        return;
      }
      await load();
    } catch (error) {
      console.error("Failed to update opportunity:", error);
      alert("Failed to update outreach status");
    } finally {
      setSavingId(null);
    }
  }

  const opportunities = data?.opportunities || [];
  const total = getNumber(data?.total);
  const summary = data?.summary || {};

  return (
    <main className="min-h-screen bg-[#090506] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
            Admin report
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            Reservation Opportunities
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Show businesses that do not have external reservation links and may
            be good candidates to sell TheOutHaven’s internal reservation
            system.
          </p>
          <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">
            No reservation link found. This location may be a good fit for
            TheOutHaven Reservations.
          </p>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard label="Total opportunities" value={total} />
          <SummaryCard
            label="Not contacted"
            value={getNumber(summary.not_contacted)}
          />
          <SummaryCard label="Contacted" value={getNumber(summary.contacted)} />
          <SummaryCard
            label="Interested"
            value={getNumber(summary.interested)}
          />
          <SummaryCard
            label="Claimed/onboarded"
            value={getNumber(summary.claimed_onboarded)}
          />
        </section>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.035] p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Input label="City" value={city} onChange={setCity} />
            <Input label="State" value={state} onChange={setState} />
            <Input label="Category" value={category} onChange={setCategory} />
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.25em] text-zinc-500">
                Outreach status
              </span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#14090d] px-4 py-3 text-sm font-black text-white outline-none transition focus:border-rose-400"
              >
                <option value="">All</option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {prettyStatus(option)}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Min rating"
              value={minRating}
              onChange={setMinRating}
              type="number"
            />
            <Input label="Search" value={q} onChange={setQ} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={applyFilters}
              className="rounded-full bg-white px-6 py-3 text-sm font-black text-black transition hover:bg-rose-100"
            >
              Apply filters
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-black text-white transition hover:border-rose-300 hover:bg-white/10"
            >
              Export CSV
            </button>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 p-5">
            <div>
              <h2 className="text-xl font-black">Opportunity list</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Sorted by highest rating, most reviews, then newest detected.
              </p>
            </div>
            {loading ? (
              <span className="text-sm font-bold text-rose-200">
                Loading...
              </span>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.18em] text-zinc-500">
                <tr>
                  <th className="px-5 py-4">Location name</th>
                  <th className="px-5 py-4">City/state</th>
                  <th className="px-5 py-4">Rating/reviews</th>
                  <th className="px-5 py-4">Website</th>
                  <th className="px-5 py-4">Google Maps</th>
                  <th className="px-5 py-4">Discovery status</th>
                  <th className="px-5 py-4">Outreach status</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {opportunities.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-10 text-center text-zinc-500"
                    >
                      No reservation opportunities found.
                    </td>
                  </tr>
                ) : (
                  opportunities.map((opportunity) => (
                    <tr
                      key={opportunity.id}
                      className="align-top text-zinc-200"
                    >
                      <td className="max-w-xs px-5 py-5">
                        <p className="font-black text-white">
                          {opportunity.name || "Unnamed location"}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-zinc-500">
                          {opportunity.address || "No address"}
                        </p>
                        <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-500/10 p-3 text-xs font-bold leading-5 text-rose-100">
                          Offer this business a claim + reservation setup so
                          customers can book directly through TheOutHaven.
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        {[opportunity.city, opportunity.state]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </td>
                      <td className="px-5 py-5">
                        {opportunity.rating || "—"} /{" "}
                        {opportunity.review_count || 0}
                      </td>
                      <td className="px-5 py-5">
                        {opportunity.website ? (
                          <a
                            className="font-bold text-rose-200 hover:text-white"
                            href={opportunity.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open Website
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-5">
                        {opportunity.google_maps_url ? (
                          <a
                            className="font-bold text-rose-200 hover:text-white"
                            href={opportunity.google_maps_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Google Maps
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-5">
                        {opportunity.reservation_discovery_status ||
                          "not_found"}
                      </td>
                      <td className="min-w-72 px-5 py-5">
                        <select
                          value={
                            opportunity.reservation_outreach_status ||
                            "not_contacted"
                          }
                          onChange={(event) =>
                            updateOpportunity(opportunity, event.target.value)
                          }
                          disabled={savingId === opportunity.id}
                          className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-bold text-white"
                        >
                          {statusOptions.map((option) => (
                            <option key={option} value={option}>
                              {prettyStatus(option)}
                            </option>
                          ))}
                        </select>
                        <textarea
                          value={notes[opportunity.id] || ""}
                          onChange={(event) =>
                            setNotes((prev) => ({
                              ...prev,
                              [opportunity.id]: event.target.value,
                            }))
                          }
                          placeholder="Outreach notes"
                          className="mt-3 min-h-20 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-rose-400"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateOpportunity(
                              opportunity,
                              opportunity.reservation_outreach_status ||
                                "not_contacted",
                            )
                          }
                          disabled={savingId === opportunity.id}
                          className="mt-2 rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white transition hover:border-rose-300 disabled:opacity-50"
                        >
                          {savingId === opportunity.id
                            ? "Saving..."
                            : "Save notes"}
                        </button>
                      </td>
                      <td className="px-5 py-5">
                        {opportunity.website ? (
                          <a
                            className="rounded-full bg-white px-4 py-2 text-xs font-black text-black"
                            href={opportunity.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open Website
                          </a>
                        ) : opportunity.google_maps_url ? (
                          <a
                            className="rounded-full bg-white px-4 py-2 text-xs font-black text-black"
                            href={opportunity.google_maps_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View Location
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-zinc-500">
              Showing {offset + 1}-
              {Math.min(offset + opportunities.length, total)} of {total}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="rounded-full border border-white/15 px-5 py-2 text-sm font-black text-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setOffset(offset + limit)}
                disabled={offset + opportunities.length >= total}
                className="rounded-full border border-white/15 px-5 py-2 text-sm font-black text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black text-white">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-[#14090d] px-4 py-3 text-sm font-black text-white outline-none transition focus:border-rose-400"
      />
    </label>
  );
}
