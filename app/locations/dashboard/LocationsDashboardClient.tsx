"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Crown,
  ExternalLink,
  MapPin,
  Search,
  Sparkles,
  Store,
} from "lucide-react";
import { clampScore } from "@/lib/clampScore";
import {
  getLocationScore,
  type LocationScoreFields,
} from "@/lib/locationScore";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationTags, getPrimaryCategory } from "@/lib/locationFields";
import {
  getDataStatus,
  getMissingFields,
  getPublicVisibilityWarning,
  isPubliclyVisible,
  type LocationVisibilityFields,
} from "@/lib/locationVisibility";
import ScoreBadge from "@/components/ScoreBadge";
import { getIsClaimed, getClaimStatusText } from "@/lib/locationClaim";

const LOCATIONS_DASHBOARD_VERSION = "locations-dashboard-refresh-2026-05-11";

type LocationType = "restaurant" | "activity";

const locationTypePathSegment: Record<
  LocationType,
  "restaurants" | "activities"
> = {
  restaurant: "restaurants",
  activity: "activities",
};

type LocationItem = LocationScoreFields &
  LocationVisibilityFields & {
    id: string;
    location_type: LocationType;
    display_name: string;
    name?: string | null;
    restaurant_name?: string | null;
    activity_name?: string | null;
    address?: string;
    city?: string;
    state?: string;
    main_image?: string | null;
    image_url?: string | null;
    images?: string[] | null;
    is_claimed?: boolean | null;
    claimed?: boolean | null;
    claim_status?: string | null;
    claimed_at?: string | null;
    claimed_by_email?: string | null;
    owner_user_id?: string | null;
    owner_name?: string;
    owner_email?: string;
    owner_phone?: string;
    primary_category?: string | null;
    cuisine?: string | null;
    cuisine_type?: string | null;
    food_type?: string | null;
    activity_type?: string | null;
    primary_tag?: string | null;
    tags?: string[] | null;
    google_types?: string[] | null;
  };

export default function LocationsDashboardClient({
  locations,
  impersonationLabel,
}: {
  locations: LocationItem[];
  impersonationLabel?: string;
}) {
  const [selected, setSelected] = useState<LocationItem | null>(
    locations[0] || null,
  );
  const [query, setQuery] = useState("");

  const filteredLocations = useMemo(() => {
    const q = query.toLowerCase().trim();

    if (!q) return locations;

    return locations.filter((location) => {
      return [
        location.display_name,
        location.city,
        location.state,
        location.address,
        ...getLocationTags(location),
        location.owner_email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [locations, query]);

  const stats = useMemo(() => {
    return {
      total: locations.length,
      claimed: locations.filter((l) => getIsClaimed(l)).length,
      unclaimed: locations.filter((l) => !getIsClaimed(l)).length,
      average:
        locations.length > 0
          ? Math.round(
              locations.reduce(
                (sum, item) => sum + clampScore(getLocationScore(item)),
                0,
              ) / locations.length,
            )
          : 0,
    };
  }, [locations]);

  async function stopImpersonation() {
    await fetch("/api/admin/stop-impersonation", {
      method: "POST",
    });

    window.location.href = "/admin/dashboard";
  }

  const selectedVisibilityWarnings = selected
    ? getPublicVisibilityWarning(selected)
    : [];

  return (
    <main
      data-page-version={LOCATIONS_DASHBOARD_VERSION}
      className="min-h-screen bg-[#090706] text-white"
    >
      <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(190,24,93,0.24),_transparent_36%),linear-gradient(135deg,#130b0a,#090706_58%,#000)]">
        <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-rose-700/20 blur-3xl" />
        <div className="absolute bottom-[-160px] left-[-120px] h-96 w-96 rounded-full bg-[#f5b700]/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/dashboard"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10"
              >
                <ArrowLeft size={16} />
                Back to Admin
              </Link>

              <Link
                href="/support"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10"
              >
                Support Tickets
              </Link>
            </div>

            {impersonationLabel && (
              <button
                onClick={stopImpersonation}
                className="rounded-full bg-white px-4 py-2 text-sm font-black text-black hover:bg-rose-100"
              >
                Stop Viewing as Location
              </button>
            )}
          </div>

          {impersonationLabel && (
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-rose-300/30 bg-rose-500/15 px-4 py-2 text-sm font-black text-rose-100">
              <Crown size={16} />
              {impersonationLabel}
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-[1fr_390px] lg:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-[#f5b700]">
                <Sparkles size={14} />
                TheOutHaven Reserve
              </div>

              <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
                Locations Dashboard
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-white/60">
                Manage restaurant and activity profiles with a premium owner
                portal experience.
              </p>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 shadow-2xl backdrop-blur">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Total" value={stats.total} />
                <Stat label="Claimed" value={stats.claimed} />
                <Stat label="Open" value={stats.unclaimed} />
                <Stat label="Avg Score" value={stats.average} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[390px_1fr]">
        <aside className="rounded-[2rem] border border-white/10 bg-[#12100f] p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                Directory
              </p>
              <h2 className="text-xl font-black">Your Locations</h2>
            </div>

            <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">
              {filteredLocations.length}
            </div>
          </div>

          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
            <Search size={17} className="text-white/40" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search locations..."
              className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/35"
            />
          </div>

          <div className="max-h-[68vh] space-y-3 overflow-y-auto pr-1">
            {filteredLocations.map((loc) => {
              const active = selected?.id === loc.id;
              const score = clampScore(getLocationScore(loc));
              const visibilityWarnings = getPublicVisibilityWarning(loc);

              return (
                <button
                  key={`${loc.location_type}-${loc.id}`}
                  onClick={() => setSelected(loc)}
                  className={`w-full rounded-3xl border p-3 text-left transition ${
                    active
                      ? "border-[#f5b700]/50 bg-[#f5b700]/10"
                      : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-white/10">
                      {getLocationImage(loc) ? (
                        <img
                          src={getLocationImage(loc)}
                          alt={loc.display_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Store className="text-white/30" size={24} />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-sm font-black leading-tight">
                          {loc.display_name}
                        </h3>

                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-black">
                          {score}
                        </span>
                      </div>

                      <p className="line-clamp-1 text-xs font-semibold text-white/45">
                        {loc.city || "City not listed"}
                        {loc.state ? `, ${loc.state}` : ""}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Pill>
                          {loc.location_type === "restaurant"
                            ? "Restaurant"
                            : "Activity"}
                        </Pill>

                        <Pill>{getClaimStatusText(loc)}</Pill>

                        <Pill>
                          {isPubliclyVisible(loc)
                            ? "Public"
                            : getDataStatus(loc)}
                        </Pill>
                      </div>

                      {visibilityWarnings.length > 0 && (
                        <p className="mt-2 line-clamp-1 text-[11px] font-bold text-amber-200">
                          Not visible yet: {visibilityWarnings.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {filteredLocations.length === 0 && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center text-sm font-semibold text-white/45">
                No locations found.
              </div>
            )}
          </div>
        </aside>

        <section>
          {selected ? (
            <div className="overflow-hidden rounded-[2.25rem] border border-white/10 bg-[#f8f3ed] text-black shadow-2xl">
              <div className="relative h-[280px] bg-black sm:h-[360px]">
                {getLocationImage(selected) ? (
                  <img
                    src={getLocationImage(selected)}
                    alt={selected.display_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-neutral-900">
                    <Building2 className="text-white/25" size={56} />
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

                <div className="absolute bottom-5 left-5 right-5">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">
                      {selected.location_type === "restaurant"
                        ? "Restaurant"
                        : "Activity"}
                    </span>

                    <span className="rounded-full bg-[#f5b700] px-3 py-1 text-xs font-black text-black">
                      {getClaimStatusText(selected)}
                    </span>
                  </div>

                  <h2 className="max-w-3xl text-3xl font-black tracking-tight text-white sm:text-5xl">
                    {selected.display_name}
                  </h2>
                </div>
              </div>

              <div className="grid gap-6 p-5 sm:p-8 xl:grid-cols-[1fr_320px]">
                <div>
                  {selectedVisibilityWarnings.length > 0 && (
                    <VisibilityWarning missing={selectedVisibilityWarnings} />
                  )}

                  <div className="mb-6 flex flex-wrap items-center gap-3">
                    <ScoreBadge
                      score={clampScore(getLocationScore(selected))}
                    />

                    <span className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-black">
                      ✨ {getPrimaryCategory(selected)}
                    </span>

                    <span className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-black">
                      Data: {getDataStatus(selected)}
                    </span>

                    {getMissingFields(selected).length > 0 && (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-black text-amber-900">
                        Missing {getMissingFields(selected).length}
                      </span>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <InfoCard
                      title="Address"
                      value={
                        selected.address ||
                        `${selected.city || ""}${
                          selected.state ? `, ${selected.state}` : ""
                        }` ||
                        "Not listed"
                      }
                      icon={<MapPin size={18} />}
                    />

                    <InfoCard
                      title="Owner"
                      value={selected.owner_name || "Not set"}
                      subvalue={
                        selected.owner_email
                          ? maskEmail(selected.owner_email)
                          : "No email listed"
                      }
                      icon={<BadgeCheck size={18} />}
                    />
                  </div>

                  <div className="mt-6 rounded-[1.75rem] border border-black/10 bg-white p-5">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-black/40">
                      Owner Contact
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <ContactBlock label="Name" value={selected.owner_name} />
                      <ContactBlock
                        label="Email"
                        value={
                          selected.owner_email
                            ? maskEmail(selected.owner_email)
                            : undefined
                        }
                      />
                      <ContactBlock
                        label="Phone"
                        value={selected.owner_phone}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.75rem] bg-black p-5 text-white">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#f5b700]">
                    Quick Actions
                  </p>

                  <div className="mt-5 space-y-3">
                    <Link
                      href={`/locations/${locationTypePathSegment[selected.location_type]}/${selected.id}/edit`}
                      className="flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-black hover:bg-rose-100"
                    >
                      Edit Location
                      <ExternalLink size={16} />
                    </Link>

                    <Link
                      href={`/locations/${locationTypePathSegment[selected.location_type]}/${selected.id}`}
                      className="flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white hover:bg-white/15"
                    >
                      View Public Page
                      <ExternalLink size={16} />
                    </Link>
                  </div>

                  <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.06] p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        className="mt-0.5 text-[#f5b700]"
                        size={18}
                      />
                      <div>
                        <p className="text-sm font-black">Admin Mode Ready</p>
                        <p className="mt-1 text-xs leading-5 text-white/50">
                          This page now checks location impersonation cookies
                          before loading normal owner data.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[520px] items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.04] text-center">
              <div>
                <Store className="mx-auto mb-4 text-white/25" size={42} />
                <p className="text-lg font-black">Select a location</p>
                <p className="mt-1 text-sm text-white/45">
                  Choose a restaurant or activity from the left panel.
                </p>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function VisibilityWarning({ missing }: { missing: string[] }) {
  return (
    <div className="mb-6 rounded-[1.75rem] border border-amber-300 bg-amber-50 p-5 text-amber-950">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={20} />
        <div>
          <p className="text-sm font-black">
            This location is not visible in public search yet. Missing:{" "}
            {missing.join(", ")}.
          </p>
          <p className="mt-1 text-xs font-semibold text-amber-900/70">
            Public search requires is_searchable, clean data_status, no hidden
            flag, and an open lifecycle status.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white/60">
      {children}
    </span>
  );
}

function InfoCard({
  title,
  value,
  subvalue,
  icon,
}: {
  title: string;
  value: string;
  subvalue?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.75rem] border border-black/10 bg-white p-5">
      <div className="mb-4 inline-flex rounded-full bg-black p-2 text-white">
        {icon}
      </div>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-black/40">
        {title}
      </p>
      <p className="mt-2 text-sm font-black">{value}</p>
      {subvalue && (
        <p className="mt-1 text-xs font-semibold text-black/45">{subvalue}</p>
      )}
    </div>
  );
}

function ContactBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-2xl bg-black/[0.04] p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-black/35">
        {label}
      </p>
      <p className="mt-2 text-sm font-black">{value || "Not set"}</p>
    </div>
  );
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;

  return `${name[0]}***@${domain}`;
}
