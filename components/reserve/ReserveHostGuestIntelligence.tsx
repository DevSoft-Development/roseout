"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Star, UserRound } from "lucide-react";

export default function ReserveHostGuestIntelligence({
  locationId,
  reservationId,
}: {
  locationId: string;
  reservationId: string;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/v1/reserve/guests/${encodeURIComponent(reservationId)}?locationId=${encodeURIComponent(locationId)}`, { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, payload: await response.json() }))
      .then(({ ok, payload }) => { if (active && ok) setData(payload.guest || null); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locationId, reservationId]);

  if (loading) return <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs font-bold text-white/35"><RefreshCw size={12} className="mr-2 inline animate-spin" />Loading guest history…</div>;
  if (!data) return null;
  return <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-3"><div className="flex items-center gap-2"><UserRound size={14} className="text-[#ff6b86]" /><p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">Guest intelligence</p></div><div className="mt-3 grid grid-cols-3 gap-2"><div><p className="text-[9px] font-bold text-white/35">Visits</p><p className="text-lg font-black">{data.visits}</p></div><div><p className="text-[9px] font-bold text-white/35">Avg party</p><p className="text-lg font-black">{data.averagePartySize}</p></div><div><p className="text-[9px] font-bold text-white/35">No-shows</p><p className={`text-lg font-black ${data.noShows ? "text-[#ff8aa0]" : ""}`}>{data.noShows}</p></div></div>{data.preferredTable || data.favoriteServer ? <div className="mt-3 flex flex-wrap gap-2">{data.preferredTable ? <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-black">Prefers {data.preferredTable}</span> : null}{data.favoriteServer ? <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-black"><Star size={10} className="mr-1 inline" />Often served by {data.favoriteServer}</span> : null}</div> : null}{data.notes?.length ? <div className="mt-3"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-white/35">Known notes</p><p className="mt-1 text-xs font-semibold text-white/65">{data.notes.slice(0, 3).join(" · ")}</p></div> : null}</section>;
}