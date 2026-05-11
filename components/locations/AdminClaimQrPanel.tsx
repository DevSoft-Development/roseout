"use client";

import { useEffect, useState } from "react";

type ClaimLocation = {
  id: string;
  type: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  claim_url: string | null;
  qr_code_data_url: string | null;
  claim_status: string | null;
  claimed: boolean | null;
};

export default function AdminClaimQrPanel({ id, type }: { id: string; type: string }) {
  const [location, setLocation] = useState<ClaimLocation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadQr() {
      try {
        const res = await fetch(`/api/admin/location-claim-qr?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (active) setLocation(data.location || null);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadQr();
    return () => {
      active = false;
    };
  }, [id, type]);

  if (loading || !location?.qr_code_data_url) return null;

  const fullAddress = [location.address, location.city, location.state, location.zip_code].filter(Boolean).join(", ");

  return (
    <section className="rounded-[2rem] border border-rose-400/25 bg-rose-500/10 p-5 shadow-2xl backdrop-blur-xl">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Admin claim QR</p>
      <h2 className="mt-2 text-2xl font-black">Claim this location</h2>
      <p className="mt-2 text-sm leading-6 text-white/65">
        Visible only to signed-in superusers and admins. Print this QR or use the bulk label page for mailers.
      </p>
      <div className="mt-5 flex gap-4 rounded-[1.5rem] border border-white/10 bg-black/30 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={location.qr_code_data_url} alt={`${location.name || "Location"} claim QR`} className="h-28 w-28 rounded-2xl bg-white p-2" />
        <div className="min-w-0">
          <p className="font-black">{location.name}</p>
          <p className="mt-1 text-sm text-white/55">{fullAddress || "Address not listed"}</p>
          <p className="mt-2 text-xs font-black uppercase tracking-wide text-rose-200">{location.claimed ? "Claimed" : location.claim_status || "Unclaimed"}</p>
          {location.claim_url && (
            <a href={location.claim_url} className="mt-3 inline-flex max-w-full truncate rounded-full bg-white px-4 py-2 text-xs font-black text-black hover:bg-rose-100" target="_blank" rel="noopener noreferrer">
              Open claim link
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
