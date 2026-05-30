"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

type ClaimQrLocation = {
  id: string;
  type: "restaurants" | "activities";
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  claim_url: string | null;
  claim_code: string | null;
  qr_code_data_url: string | null;
};

type SortOption = "name-asc" | "name-desc" | "city-asc";

function getLocationKey(location: ClaimQrLocation) {
  return `${location.type}-${location.id}`;
}

function getLocationName(location: ClaimQrLocation) {
  return location.name?.trim() || "Untitled location";
}

function getCityStateZip(location: ClaimQrLocation) {
  const city = location.city?.trim();
  const state = location.state?.trim();
  const zip = location.zip_code?.trim();
  const cityState = [city, state].filter(Boolean).join(", ");

  return [cityState, zip].filter(Boolean).join(" ");
}

function getSearchText(location: ClaimQrLocation) {
  return [
    location.name,
    location.address,
    location.city,
    location.state,
    location.zip_code,
    location.claim_url,
    location.claim_code,
    location.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getDisplayClaimUrl(claimUrl: string | null) {
  if (!claimUrl) {
    return null;
  }

  return claimUrl.replace(/^(https?:\/\/)?(www\.)?roseout\.com/i, "https://www.theouthaven.com");
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export default function ClaimQrPrintClient({ locations }: { locations: ClaimQrLocation[] }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(locations.map(getLocationKey)),
  );

  const visibleLocations = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? locations.filter((location) => getSearchText(location).includes(query))
      : locations;

    return [...searched].sort((left, right) => {
      if (sortBy === "name-desc") {
        return compareText(getLocationName(right), getLocationName(left));
      }

      if (sortBy === "city-asc") {
        const cityComparison = compareText(left.city || "", right.city || "");
        return cityComparison || compareText(getLocationName(left), getLocationName(right));
      }

      return compareText(getLocationName(left), getLocationName(right));
    });
  }, [locations, search, sortBy]);

  const visibleKeys = useMemo(() => visibleLocations.map(getLocationKey), [visibleLocations]);
  const visibleSelectedCount = visibleKeys.filter((key) => selectedKeys.has(key)).length;
  const selectedCount = selectedKeys.size;
  const allVisibleSelected = visibleKeys.length > 0 && visibleSelectedCount === visibleKeys.length;

  function toggleLocation(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleVisibleLocations() {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleKeys.forEach((key) => next.delete(key));
      } else {
        visibleKeys.forEach((key) => next.add(key));
      }
      return next;
    });
  }

  return (
    <>
      <section className="no-print mt-6 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl">
        <div className="grid gap-4 lg:grid-cols-[1fr_220px_auto] lg:items-end">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-white/50">
              Search locations
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by location, address, city, state, or ZIP"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/30 focus:border-rose-400"
            />
          </label>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.25em] text-white/50">
              Sort locations
            </span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-black text-white outline-none focus:border-rose-400"
            >
              <option value="name-asc">Location A-Z</option>
              <option value="name-desc">Location Z-A</option>
              <option value="city-asc">City A-Z</option>
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleVisibleLocations}
              disabled={visibleLocations.length === 0}
              className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-black text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {allVisibleSelected ? "Clear visible" : "Select visible"}
            </button>
            <button
              type="button"
              onClick={() => {
                const printKeys = new Set(visibleKeys);
                setSelectedKeys(printKeys);
                setTimeout(() => window.print(), 50);
              }}
              disabled={visibleLocations.length === 0}
              className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-3 text-sm font-black text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Print all visible
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={selectedCount === 0}
              className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-45"
            >
              Print selected
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/45">
          <span>{visibleLocations.length} locations shown</span>
          <span>•</span>
          <span>{visibleSelectedCount} shown selected</span>
          <span>•</span>
          <span>{selectedCount} total selected to print</span>
        </div>
      </section>

      <section className="qr-sheet mt-6 grid gap-4 rounded-[2rem] border border-white/10 bg-white p-4 text-black shadow-2xl print:mt-0 print:rounded-none print:border-0 print:p-0 md:grid-cols-2 print:grid-cols-2">
        {visibleLocations.map((location) => {
          const key = getLocationKey(location);
          const isSelected = selectedKeys.has(key);
          const cityStateZip = getCityStateZip(location);
          const displayClaimUrl = getDisplayClaimUrl(location.claim_url);

          return (
            <div
              key={key}
              className={`qr-card relative grid min-h-[180px] grid-cols-[145px_1fr] gap-4 rounded-3xl border bg-white p-4 ${
                isSelected ? "border-black/15" : "border-black/5 opacity-45 print:hidden"
              }`}
            >
              <label className="no-print absolute right-4 top-4 flex items-center gap-2 rounded-full bg-black/5 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-black/60">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleLocation(key)}
                  className="h-4 w-4 accent-rose-600"
                />
                Print
              </label>

              <div className="flex flex-col items-center justify-center rounded-2xl border border-black/10 bg-white p-2 print:min-h-[132px]">
                {location.qr_code_data_url ? (
                  <Image
                    unoptimized
                    src={location.qr_code_data_url}
                    alt={`Claim QR for ${getLocationName(location)}`}
                    width={128}
                    height={128}
                    className="h-28 w-28 object-contain print:h-28 print:w-28"
                  />
                ) : (
                  <div className="text-xs font-black text-rose-700">Missing QR — run repair</div>
                )}
                <p className="mt-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-black/60">
                  Please scan here
                </p>
              </div>
              <div className="flex flex-col justify-center pr-16 print:pr-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-700">
                  www.theouthaven.com
                </p>
                <h2 className="mt-2 text-2xl font-black leading-tight print:text-xl">
                  {getLocationName(location)}
                </h2>
                <div className="mt-3 space-y-1 text-sm font-bold leading-5 text-black/65">
                  <p>{location.address?.trim() || "Address not listed"}</p>
                  {cityStateZip && <p>{cityStateZip}</p>}
                </div>
                <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-black/45">
                  Or enter claim code manually
                </p>
                <p className="font-mono text-lg font-black tracking-[0.14em] text-black">
                  {location.claim_code || "Missing code"}
                </p>
                {displayClaimUrl && (
                  <p className="mt-2 break-all text-[10px] font-bold text-black/35">
                    {displayClaimUrl}
                  </p>
                )}
                <Link href={`/admin/dashboard/crm/${location.id}?tab=qr`} className="no-print mt-3 inline-flex rounded-full bg-[#1b1210] px-3 py-2 text-xs font-black text-white">
                  Open Location CRM
                </Link>
              </div>
            </div>
          );
        })}

        {locations.length === 0 && (
          <div className="p-8 text-center text-sm font-bold text-black/45">
            No claim QR codes found. Import or create locations to generate claim QR codes.
          </div>
        )}

        {locations.length > 0 && visibleLocations.length === 0 && (
          <div className="p-8 text-center text-sm font-bold text-black/45">
            No locations match your search.
          </div>
        )}
      </section>
    </>
  );
}
