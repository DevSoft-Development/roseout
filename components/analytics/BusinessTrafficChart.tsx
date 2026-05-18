type DailyRow = {
  analytics_date: string;
  profile_views?: number;
  search_appearances?: number;
  search_clicks?: number;
};

export default function BusinessTrafficChart({ daily }: { daily: DailyRow[] }) {
  const max = Math.max(
    1,
    ...daily.map(
      (row) =>
        Number(row.profile_views || 0) +
        Number(row.search_appearances || 0) +
        Number(row.search_clicks || 0),
    ),
  );

  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#12100f] p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#f5b700]">Traffic</p>
          <h2 className="text-2xl font-black text-white">Discovery performance</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-bold text-white/55">
          <span>Views</span><span>Appearances</span><span>Clicks</span>
        </div>
      </div>
      <div className="flex h-72 items-end gap-2 overflow-x-auto pb-2">
        {daily.length === 0 ? <EmptyChart /> : daily.map((row) => {
          const views = Number(row.profile_views || 0);
          const appearances = Number(row.search_appearances || 0);
          const clicks = Number(row.search_clicks || 0);
          return (
            <div key={row.analytics_date} className="flex min-w-12 flex-1 flex-col items-center gap-2">
              <div className="flex h-56 w-full items-end gap-1 rounded-t-2xl bg-white/[0.03] p-1">
                <Bar value={views} max={max} className="bg-rose-500" />
                <Bar value={appearances} max={max} className="bg-[#f5b700]" />
                <Bar value={clicks} max={max} className="bg-white" />
              </div>
              <span className="text-[10px] font-black text-white/35">{row.analytics_date.slice(5)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  return <div title={String(value)} className={`w-full rounded-t-full ${className}`} style={{ height: `${Math.max(4, (value / max) * 100)}%` }} />;
}

function EmptyChart() {
  return <div className="flex h-full w-full items-center justify-center rounded-3xl border border-dashed border-white/10 text-sm font-bold text-white/35">Analytics will appear after customer activity is tracked.</div>;
}
