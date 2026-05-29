"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getLocationName } from "@/lib/locationName";

type ClaimStatus = "approved" | "rejected" | "needs_more_info";

type LocationClaim = {
  id: string;
  type: "restaurant" | "activity" | "location";
  location_name: string;
  location_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  message?: string | null;
  verification_status?: string | null;
  match_status?: string | null;
  confidence_score?: number | null;
  plan_interest?: string | null;
  role_at_business?: string | null;
  request_type?: string | null;
  user_id?: string | null;
  location_id?: string | null;
  matched_location_snapshot?: unknown;
  claim_code?: string | null;
  status: string;
  created_at?: string;
};

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadge(status?: string | null) {
  const value = status || "pending";

  if (value === "approved") return "border-rose-200 bg-rose-50 text-rose-700";
  if (value === "rejected") return "border-red-200 bg-red-50 text-red-700";
  if (value === "needs_more_info") return "border-sky-200 bg-sky-50 text-sky-700";

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function Badge({ tone, children }: { tone: "emerald" | "amber" | "red" | "rose" | "slate"; children: ReactNode }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-black/10 bg-white text-black/45",
  };
  return <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${tones[tone]}`}>{children}</span>;
}

export default function AdminClaimsPage() {
  const [claims, setClaims] = useState<LocationClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function fetchClaims() {
    setLoading(true);

    const res = await fetch("/api/admin/claims", {
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(data.error || "Failed to load claims");
      setClaims([]);
      setLoading(false);
      return;
    }

    const restaurantClaims: LocationClaim[] = (data.restaurantClaims || []).map(
      (claim: any) => ({
        id: claim.id,
        type: "restaurant",
        location_name:
          getLocationName(claim, claim.location_name || "Unnamed Restaurant"),
        address: claim.address,
        city: claim.city,
        state: claim.state,
        zip_code: claim.zip_code,
        owner_name: claim.owner_name,
        owner_email: claim.owner_email,
        owner_phone: claim.owner_phone,
        message: claim.message,
        status: claim.status,
        created_at: claim.created_at,
      })
    );

    const activityClaims: LocationClaim[] = (data.activityClaims || []).map(
      (claim: any) => ({
        id: claim.id,
        type: "activity",
        location_name:
          getLocationName(claim, claim.location_name || "Unnamed Activity"),
        location_type: claim.activity_type,
        address: claim.address,
        city: claim.city,
        state: claim.state,
        zip_code: claim.zip_code,
        owner_name: claim.owner_name,
        owner_email: claim.owner_email,
        owner_phone: claim.owner_phone,
        message: claim.message,
        status: claim.status,
        created_at: claim.created_at,
      })
    );

    const locationClaims: LocationClaim[] = (data.locationClaims || []).map(
      (claim: any) => ({
        id: claim.id,
        type: "location",
        location_name: claim.location_name || "Unnamed Location",
        location_type: claim.location_type,
        address: claim.address,
        city: claim.city,
        state: claim.state,
        zip_code: claim.zip_code,
        owner_name: claim.owner_name,
        owner_email: claim.owner_email,
        owner_phone: claim.owner_phone,
        message: claim.notes,
        verification_status: claim.verification_status,
        match_status: claim.match_status,
        confidence_score: claim.confidence_score,
        plan_interest: claim.plan_interest,
        role_at_business: claim.role_at_business,
        request_type: claim.request_type,
        user_id: claim.user_id,
        location_id: claim.location_id,
        matched_location_snapshot: claim.matched_location_snapshot,
        claim_code: claim.claim_code,
        status: claim.status,
        created_at: claim.submitted_at || claim.created_at,
      })
    );

    setClaims([...locationClaims, ...restaurantClaims, ...activityClaims]);
    setLoading(false);
  }

  useEffect(() => {
    fetchClaims();
  }, []);

  async function updateClaimStatus(
    id: string,
    type: "restaurant" | "activity" | "location",
    status: ClaimStatus
  ) {
    setUpdatingId(id);

    const res = await fetch("/api/admin/claims/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, type, status }),
    });

    const data = await res.json();

    setUpdatingId(null);

    if (!res.ok) {
      alert(data.error || "Failed to update location claim.");
      return;
    }

    await fetchClaims();

    if (status === "approved" && data.signup_url) {
      alert(`Location claim approved.\n\nOwner signup link:\n${data.signup_url}`);
    }
  }

  const stats = useMemo(() => {
    const pending = claims.filter((claim) => claim.status === "pending").length;
    const approved = claims.filter((claim) => claim.status === "approved").length;
    const rejected = claims.filter((claim) => claim.status === "rejected").length;
    const needsMoreInfo = claims.filter((claim) => claim.status === "needs_more_info").length;

    return {
      total: claims.length,
      pending,
      approved,
      rejected,
      needsMoreInfo,
    };
  }, [claims]);

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_35%),linear-gradient(135deg,#160b0b,#090706_55%,#140f0a)] p-5 shadow-2xl sm:p-6">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-rose-300">
                TheOutHaven Admin
              </p>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Location Claims
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                Review restaurant and activity owner requests, approve claims,
                and generate owner signup access.
              </p>
            </div>

            <button
              onClick={fetchClaims}
              className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:scale-[1.03]"
            >
              Refresh Claims
            </button>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Total Claims
            </p>
            <p className="mt-2 text-3xl font-black">
              {formatNumber(stats.total)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Pending
            </p>
            <p className="mt-2 text-3xl font-black text-rose-200">
              {formatNumber(stats.pending)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Approved
            </p>
            <p className="mt-2 text-3xl font-black">
              {formatNumber(stats.approved)}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4 shadow-xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">
              Rejected
            </p>
            <p className="mt-2 text-3xl font-black text-white/70">
              {formatNumber(stats.rejected)}
            </p>
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
          <div className="flex flex-col gap-3 border-b border-black/10 bg-[#fffaf6] p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black">Claim Requests</h2>
              <p className="mt-1 text-xs font-medium text-black/50">
                Premium review queue for restaurant and activity ownership
                requests.
              </p>
            </div>

            <div className="rounded-full bg-[#1b1210] px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white">
              {loading ? "Loading" : `${formatNumber(claims.length)} Claims`}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-2xl">
                🌹
              </div>
              <p className="mt-4 text-lg font-black">Loading claims...</p>
              <p className="mt-1 text-sm text-black/50">
                Checking owner claim requests.
              </p>
            </div>
          ) : claims.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-2xl">
                ✓
              </div>
              <p className="mt-4 text-lg font-black">No claims found</p>
              <p className="mt-1 text-sm text-black/50">
                New restaurant and activity claims will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {claims.map((claim) => {
                const address = [
                  claim.address,
                  claim.city,
                  claim.state,
                  claim.zip_code,
                ]
                  .filter(Boolean)
                  .join(", ");

                const isUpdating = updatingId === claim.id;

                return (
                  <section
                    key={`${claim.type}-${claim.id}`}
                    className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-xl"
                  >
                    <div className="grid gap-5 xl:grid-cols-[1fr_360px_220px] xl:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-black/10 bg-[#f5eee8] px-3 py-1 text-[11px] font-black uppercase text-black/55">
                            {claim.type === "restaurant" ? "Restaurant" : claim.type === "activity" ? "Activity" : "Location"}
                          </span>

                          <span
                            className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${statusBadge(
                              claim.status
                            )}`}
                          >
                            {claim.status || "pending"}
                          </span>

                          <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-black uppercase text-black/40">
                            {formatDate(claim.created_at)}
                          </span>
                        </div>

                        <h3 className="mt-3 truncate text-xl font-black">
                          {claim.location_name}
                        </h3>

                        {claim.location_type && (
                          <p className="mt-1 text-sm font-black text-rose-700">
                            {claim.location_type}
                          </p>
                        )}

                        {address && (
                          <p className="mt-2 text-sm leading-6 text-black/50">
                            {address}
                          </p>
                        )}

                        <div className="mt-4 flex flex-wrap gap-2">
                          {claim.claim_code ? <Badge tone="emerald">Code Verified</Badge> : <Badge tone="slate">No Code</Badge>}
                          {claim.verification_status === "background_matched" && <Badge tone="emerald">Background Matched</Badge>}
                          {claim.verification_status === "needs_admin_match" && <Badge tone="amber">Needs Admin Match</Badge>}
                          {claim.match_status && <Badge tone={claim.match_status === "no_match" ? "red" : claim.match_status === "exact_match" ? "emerald" : "amber"}>{claim.match_status.replace(/_/g, " ")}</Badge>}
                          {claim.plan_interest === "pro" ? <Badge tone="rose">Pro Plan</Badge> : claim.plan_interest ? <Badge tone="slate">Free Discovery</Badge> : null}
                          {claim.request_type && <Badge tone="slate">{claim.request_type}</Badge>}
                          {claim.claim_code && (
                            <span className="rounded-full border border-black/10 bg-white px-3 py-1 font-mono text-[11px] font-black uppercase text-black/45">
                              {claim.claim_code}
                            </span>
                          )}
                        </div>

                        {claim.message && (
                          <div className="mt-4 rounded-2xl border border-black/10 bg-[#f5eee8] p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/35">
                              Owner Message
                            </p>
                            <p className="mt-2 text-sm leading-6 text-black/65">
                              {claim.message}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="rounded-[1.25rem] bg-[#f5eee8] p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/35">
                          Owner Info
                        </p>

                        <div className="mt-3 space-y-2 text-sm">
                          <p className="truncate">
                            <span className="font-black text-black/40">
                              Name:
                            </span>{" "}
                            <strong>{claim.owner_name || "Not provided"}</strong>
                          </p>

                          <p className="truncate">
                            <span className="font-black text-black/40">
                              Email:
                            </span>{" "}
                            <strong>
                              {claim.owner_email || "Not provided"}
                            </strong>
                          </p>

                          <p className="truncate">
                            <span className="font-black text-black/40">
                              Phone:
                            </span>{" "}
                            <strong>
                              {claim.owner_phone || "Not provided"}
                            </strong>
                          </p>

                          <p className="truncate">
                            <span className="font-black text-black/40">
                              Role:
                            </span>{" "}
                            <strong>{claim.role_at_business || "Not provided"}</strong>
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 xl:flex-col">
                        <button
                          disabled={isUpdating}
                          onClick={() =>
                            updateClaimStatus(
                              claim.id,
                              claim.type,
                              "approved"
                            )
                          }
                          className="flex-1 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:scale-[1.03] disabled:opacity-50"
                        >
                          {isUpdating ? "Updating..." : "Approve"}
                        </button>

                        <button
                          disabled={isUpdating}
                          onClick={() =>
                            updateClaimStatus(
                              claim.id,
                              claim.type,
                              "needs_more_info"
                            )
                          }
                          className="flex-1 rounded-full border border-black/10 bg-sky-700 px-4 py-3 text-sm font-black text-white transition hover:bg-sky-800 disabled:opacity-50"
                        >
                          Needs More Info
                        </button>

                        <button
                          disabled={isUpdating}
                          onClick={() =>
                            updateClaimStatus(
                              claim.id,
                              claim.type,
                              "rejected"
                            )
                          }
                          className="flex-1 rounded-full border border-black/10 bg-[#1b1210] px-4 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}