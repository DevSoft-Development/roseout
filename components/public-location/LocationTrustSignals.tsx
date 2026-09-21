import Link from "next/link";
import { BadgeCheck, CheckCircle2, Clock3 } from "lucide-react";
import { locationFreshnessLabel, locationTrustSignals, type LocationTrustInput } from "@/lib/location-trust";

export default function LocationTrustSignals({ location }: { location: LocationTrustInput }) {
  const trust = locationTrustSignals(location);
  const freshness = locationFreshnessLabel(location);
  if (!trust.claimed && !trust.verified && !freshness) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Business information status">
      {trust.verified ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-black text-emerald-100" title="TheOutHaven has completed the applicable verification process.">
          <BadgeCheck size={14} /> Verified
        </span>
      ) : trust.claimed ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-black text-white/70" title="An authorized business representative controls this listing.">
          <CheckCircle2 size={14} /> Owner claimed
        </span>
      ) : null}
      {freshness ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-white/55">
          <Clock3 size={13} /> {freshness}
        </span>
      ) : null}
      <Link href="/trust" className="text-[11px] font-black text-[#ff7188] hover:text-white">What these mean</Link>
    </div>
  );
}
