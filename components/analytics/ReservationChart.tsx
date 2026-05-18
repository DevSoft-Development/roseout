type DailyRow = {
  analytics_date: string;
  reservation_completions?: number;
  reservation_cancellations?: number;
};

export default function ReservationChart({ daily }: { daily: DailyRow[] }) {
  const max = Math.max(1, ...daily.map((row) => Number(row.reservation_completions || 0) + Number(row.reservation_cancellations || 0)));

  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#12100f] p-5">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#f5b700]">Reservations</p>
      <h2 className="text-2xl font-black text-white">Booking funnel by day</h2>
      <div className="mt-6 space-y-3">
        {daily.length === 0 ? <p className="rounded-3xl border border-dashed border-white/10 p-6 text-sm font-bold text-white/35">No reservation analytics yet.</p> : daily.map((row) => {
          const completed = Number(row.reservation_completions || 0);
          const cancelled = Number(row.reservation_cancellations || 0);
          return (
            <div key={row.analytics_date} className="grid grid-cols-[72px_1fr_42px] items-center gap-3">
              <span className="text-xs font-black text-white/45">{row.analytics_date.slice(5)}</span>
              <div className="h-4 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-[#f5b700]" style={{ width: `${Math.max(2, (completed / max) * 100)}%` }} />
                {cancelled > 0 ? <div className="-mt-4 h-full rounded-full bg-rose-500/75" style={{ width: `${Math.max(2, (cancelled / max) * 100)}%` }} /> : null}
              </div>
              <span className="text-right text-xs font-black text-white">{completed}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
