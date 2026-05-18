type Insights = {
  repeat_visitor_rate?: number;
  average_party_size?: number;
  top_outing_types?: { label: string; count: number }[];
  popular_times?: { day_of_week: number; hour_of_day: number }[];
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pct(value?: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

export default function CustomerInsightsPanel({ insights }: { insights: Insights }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#12100f] p-5">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#f5b700]">Customers</p>
      <h2 className="text-2xl font-black text-white">Customer Insights</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Insight label="Repeat visitor rate" value={pct(insights.repeat_visitor_rate)} />
        <Insight label="Avg party size" value={Number(insights.average_party_size || 0).toFixed(1)} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
          <p className="text-sm font-black text-white">Top outing types</p>
          <div className="mt-3 space-y-2">
            {(insights.top_outing_types || []).length === 0 ? <p className="text-sm font-bold text-white/35">No outing preference data yet.</p> : insights.top_outing_types?.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl bg-white/[0.05] px-3 py-2 text-sm font-bold text-white/70">
                <span>{item.label}</span><span>{item.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
          <p className="text-sm font-black text-white">Popular times</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(insights.popular_times || []).length === 0 ? <p className="text-sm font-bold text-white/35">No busy-hour data yet.</p> : insights.popular_times?.map((time, index) => (
              <span key={`${time.day_of_week}-${time.hour_of_day}-${index}`} className="rounded-full bg-[#f5b700]/15 px-3 py-1 text-xs font-black text-[#f5b700]">
                {DAYS[time.day_of_week]} {time.hour_of_day}:00
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Insight({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl border border-white/10 bg-black/25 p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">{label}</p><p className="mt-2 text-3xl font-black text-white">{value}</p></div>;
}
