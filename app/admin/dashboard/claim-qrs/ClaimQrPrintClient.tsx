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

function getLocationKey(location: ClaimQrLocation) {
  return `${location.type}-${location.id}`;
}

function getLocationName(location: ClaimQrLocation) {
  return location.name?.trim() || "Untitled location";
}

function getStreetAddress(location: ClaimQrLocation) {
  return location.address?.trim() || "Address unavailable";
}

function getCityStateZip(location: ClaimQrLocation) {
  return [location.city?.trim(), location.state?.trim(), location.zip_code?.trim()]
    .filter(Boolean)
    .join(location.city && location.state ? ", " : " ")
    .replace(/, ([A-Z]{2}), /, ", $1 ");
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
      <style jsx global>{`
        .claim-label-sheet {
          align-items: start;
        }

        .claim-label {
          aspect-ratio: 2 / 1;
        }

        .claim-scan-script {
          font-family: "Brush Script MT", "Segoe Script", "Apple Chancery", cursive;
        }

        .claim-footer-logo {
          filter: grayscale(1) brightness(0);
        }

        @media print {
          @page {
            size: 4in 2in;
            margin: 0;
          }

          html,
          body {
            width: 4in !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
          }

          body * {
            visibility: hidden !important;
          }

          .claim-print-root,
          .claim-print-root * {
            visibility: visible !important;
          }

          .claim-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            display: block !important;
            width: 4in !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: white !important;
            box-shadow: none !important;
          }

          .claim-label {
            box-sizing: border-box !important;
            display: grid !important;
            width: 4in !important;
            height: 2in !important;
            min-height: 2in !important;
            max-height: 2in !important;
            margin: 0 !important;
            padding: 0.11in 0.13in 0.08in !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: white !important;
            box-shadow: none !important;
            overflow: hidden !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            page-break-after: always !important;
          }

          .claim-label:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }

          .claim-label-qr {
            width: 0.82in !important;
            height: 0.82in !important;
          }

          .claim-label-divider {
            top: 0.17in !important;
            bottom: 0.34in !important;
          }

          .claim-label-footer {
            height: 0.26in !important;
          }

          .no-print,
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>

      <section className="no-print sticky top-3 z-30 mt-6 rounded-3xl border border-white/10 bg-[#15100e]/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black">Choose what to print</p>
            <p className="mt-1 text-xs font-bold text-white/45">{selectedCount} of {locations.length} selected · 4 × 2 inch thermal labels</p>
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

      <section className="claim-print-root claim-label-sheet mt-6 grid gap-4 rounded-[2rem] border border-white/10 bg-white p-4 text-black shadow-2xl md:grid-cols-2">
        {locations.map((location) => {
          const key = getLocationKey(location);
          const isSelected = selectedKeys.has(key);
          const cityStateZip = getCityStateZip(location);

          return (
            <article
              key={key}
              className={`claim-label relative grid grid-cols-[35%_65%] grid-rows-[1fr_auto] overflow-hidden rounded-3xl border bg-white px-5 pb-3 pt-4 transition ${isSelected ? "border-black/15" : "border-black/5 opacity-40 print:hidden"}`}
            >
              <label className="no-print absolute right-3 top-3 z-10 flex cursor-pointer items-center gap-2 rounded-full bg-black/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-black/60">
                <input type="checkbox" checked={isSelected} onChange={() => toggleLocation(key)} className="h-4 w-4 accent-rose-600" />
                {isSelected ? "Selected" : "Select"}
              </label>

              <div className="relative flex min-w-0 flex-col items-center justify-center pr-4">
                <div className="relative mb-1 h-8 w-full">
                  <span className="claim-scan-script absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-[24px] leading-none text-black">Scan here</span>
                  <svg className="absolute -left-1 top-1 h-12 w-14 overflow-visible" viewBox="0 0 56 48" aria-hidden="true">
                    <path d="M48 2C20 4 6 17 8 38" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
                    <path d="M2 32L8 40l9-5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                {location.qr_code_data_url ? (
                  <Image
                    unoptimized
                    src={location.qr_code_data_url}
                    alt={`Claim QR for ${getLocationName(location)}`}
                    width={140}
                    height={140}
                    className="claim-label-qr h-[108px] w-[108px] object-contain"
                  />
                ) : (
                  <div className="claim-label-qr flex h-[108px] w-[108px] items-center justify-center border border-black/20 px-2 text-center text-[10px] font-black text-black/50">
                    QR unavailable
                  </div>
                )}

                <p className="mt-1 text-center text-[9px] font-black uppercase tracking-[0.18em] text-black">Claim code</p>
                <p className="mt-0.5 text-center font-mono text-[19px] font-black leading-none tracking-[0.04em] text-black">
                  {location.claim_code || "Missing"}
                </p>
              </div>

              <div className="claim-label-divider absolute bottom-[46px] left-[35%] top-4 w-px bg-black" aria-hidden="true" />

              <div className="flex min-w-0 flex-col justify-center pl-5 pr-2">
                <h2 className="max-w-full text-[22px] font-black leading-[1.05] text-black">{getLocationName(location)}</h2>
                <p className="mt-4 text-[13px] font-medium leading-[1.35] text-black">{getStreetAddress(location)}</p>
                {cityStateZip && <p className="mt-1 text-[13px] font-medium leading-[1.35] text-black">{cityStateZip}</p>}
                <Link href={`/admin/dashboard/crm/${location.id}?tab=qr`} className="no-print mt-3 inline-flex w-fit rounded-full bg-[#1b1210] px-3 py-2 text-xs font-black text-white">
                  Open CRM
                </Link>
              </div>

              <footer className="claim-label-footer col-span-2 mt-2 flex min-w-0 items-center justify-center gap-2 border-t border-transparent pt-1 text-[8px] font-black text-black">
                <img src="/toh_logo.png" alt="TheOutHaven" className="claim-footer-logo h-[18px] w-[18px] shrink-0 object-contain" />
                <span className="whitespace-nowrap">TheOutHaven LLC</span>
                <span className="text-black/55">|</span>
                <span className="whitespace-nowrap">www.TheOutHaven.com</span>
                <span className="text-black/55">|</span>
                <span className="whitespace-nowrap">hello@theouthaven.com</span>
              </footer>
            </article>
          );
        })}
      </section>
    </>
  );
}
