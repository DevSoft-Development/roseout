"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatFullAddress } from "@/lib/address-utils";

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

function getLocationKey(location: ClaimQrLocation) {
  return `${location.type}-${location.id}`;
}

function getLocationName(location: ClaimQrLocation) {
  return location.name?.trim() || "Untitled location";
}

function getLocationAddress(location: ClaimQrLocation) {
  return formatFullAddress({
    address: location.address,
    city: location.city,
    state: location.state,
    zip_code: location.zip_code,
  });
}

function getDisplayClaimUrl(claimUrl: string | null) {
  if (!claimUrl) return null;
  return claimUrl.replace(/^(https?:\/\/)?(www\.)?roseout\.com/i, "https://theouthaven.com");
}

export default function ClaimQrPrintClient({ locations }: { locations: ClaimQrLocation[] }) {
  const allKeys = useMemo(() => locations.map(getLocationKey), [locations]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set(allKeys));
  const selectedCount = selectedKeys.size;
  const allSelected = locations.length > 0 && selectedCount === locations.length;

  function toggleLocation(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelectedKeys(new Set(allKeys));
  }

  function clearAll() {
    setSelectedKeys(new Set());
  }

  if (locations.length === 0) {
    return (
      <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.05] p-10 text-center text-sm font-bold text-white/50">
        No claim QR codes match this view.
      </section>
    );
  }

  return (
    <>
      <section className="no-print sticky top-3 z-30 mt-6 rounded-3xl border border-white/10 bg-[#15100e]/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black">Choose what to print</p>
            <p className="mt-1 text-xs font-bold text-white/45">{selectedCount} of {locations.length} selected</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={allSelected ? clearAll : selectAll} className="rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2.5 text-xs font-black text-white/80 hover:bg-white/10">
              {allSelected ? "Clear all" : "Select all"}
            </button>
            <button type="button" onClick={clearAll} disabled={selectedCount === 0} className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-xs font-black text-white/60 disabled:opacity-35">
              Clear
            </button>
            <button type="button" onClick={() => window.print()} disabled={selectedCount === 0} className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-black text-white shadow-lg hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40">
              Print selected ({selectedCount})
            </button>
          </div>
        </div>
      </section>

      <section className="qr-sheet mt-6 grid gap-4 rounded-[2rem] border border-white/10 bg-white p-4 text-black shadow-2xl print:mt-0 print:rounded-none print:border-0 print:p-0 md:grid-cols-2 print:grid-cols-2">
        {locations.map((location) => {
          const key = getLocationKey(location);
          const isSelected = selectedKeys.has(key);
          const displayClaimUrl = getDisplayClaimUrl(location.claim_url);

          return (
            <article key={key} className={`qr-card relative grid min-h-[190px] grid-cols-[132px_1fr] gap-4 rounded-3xl border bg-white p-4 transition ${isSelected ? "border-black/15" : "border-black/5 opacity-40 print:hidden"}`}>
              <label className="no-print absolute right-4 top-4 flex cursor-pointer items-center gap-2 rounded-full bg-black/5 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-black/60">
                <input type="checkbox" checked={isSelected} onChange={() => toggleLocation(key)} className="h-4 w-4 accent-rose-600" />
                {isSelected ? "Selected" : "Select"}
              </label>

              <div className="flex flex-col items-center justify-center rounded-2xl border border-black/10 bg-white p-2">
                {location.qr_code_data_url ? (
                  <Image unoptimized src={location.qr_code_data_url} alt={`Claim QR for ${getLocationName(location)}`} width={116} height={116} className="h-28 w-28 object-contain" />
                ) : (
                  <div className="px-2 text-center text-xs font-black text-rose-700">QR unavailable</div>
                )}
                <p className="mt-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-black/55">Scan to claim</p>
              </div>

              <div className="flex min-w-0 flex-col justify-center pr-16 print:pr-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-700">TheOutHaven</p>
                <h2 className="mt-2 text-xl font-black leading-tight">{getLocationName(location)}</h2>
                <p className="mt-2 text-sm font-bold leading-5 text-black/55">{getLocationAddress(location)}</p>
                <div className="mt-3 rounded-xl bg-black/[0.04] px-3 py-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-black/40">Claim code</p>
                  <p className="mt-1 font-mono text-base font-black tracking-[0.12em] text-black">{location.claim_code || "Missing code"}</p>
                </div>
                {displayClaimUrl && <p className="mt-2 truncate text-[10px] font-bold text-black/30">{displayClaimUrl}</p>}
                <Link href={`/admin/dashboard/crm/${location.id}?tab=qr`} className="no-print mt-3 inline-flex w-fit rounded-full bg-[#1b1210] px-3 py-2 text-xs font-black text-white">Open CRM</Link>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
