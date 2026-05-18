type HourlyRow = {
  day_of_week: number;
  hour_of_day: number;
  profile_views?: number;
  search_clicks?: number;
  reservations?: number;
  cancellations?: number;
  intensity?: number;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, index) => index);

export default function BusiestHoursHeatmap({ hourly, title = "Busiest Hours" }: { hourly: HourlyRow[]; title?: string }) {
  const lookup = new Map(hourly.map((row) => [`${row.day_of_week}-${row.hour_of_day}`, row]));
  const max = Math.max(1, ...hourly.map((row) => Number(row.intensity ?? row.profile_views ?? 0) + Number(row.search_clicks || 0) + Number(row.reservations || 0)));

  return (
    <section className="rounded-[2rem] border border-white/10 bg-[#12100f] p-5">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#f5b700]">Heatmap</p>
      <h2 className="text-2xl font-black text-white">{title}</h2>
      <div className="mt-6 overflow-x-auto">
        <div className="grid min-w-[780px] grid-cols-[52px_repeat(24,minmax(22px,1fr))] gap-1">
          <div />
          {HOURS.map((hour) => <div key={hour} className="text-center text-[9px] font-black text-white/30">{hour}</div>)}
          {DAYS.map((day, dayIndex) => (
            <div key={day} className="contents">
              <div className="py-1 text-xs font-black text-white/45">{day}</div>
              {HOURS.map((hour) => {
                const row = lookup.get(`${dayIndex}-${hour}`);
                const value = Number(row?.intensity ?? 0) || Number(row?.profile_views || 0) + Number(row?.search_clicks || 0) * 2 + Number(row?.reservations || 0) * 4;
                const opacity = Math.min(1, 0.12 + value / max);
                return (
                  <div
                    key={`${day}-${hour}`}
                    title={`${day} ${hour}:00 · ${value}`}
                    className="h-7 rounded-md border border-white/5"
                    style={{ backgroundColor: `rgba(245, 183, 0, ${opacity})` }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
