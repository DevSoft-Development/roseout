export function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(d);
}
export function formatNumber(value: number | null | undefined) { return Number.isFinite(value) ? new Intl.NumberFormat('en-US').format(value as number) : '0'; }
export function formatPercent(value: number | null | undefined) { return Number.isFinite(value) ? `${Math.max(0,Math.min(100, Number(value))).toFixed(0)}%` : '0%'; }
export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "Not set";
  const d = new Date(value); if (Number.isNaN(d.getTime())) return "Not set";
  const diff = Math.round((d.getTime()-Date.now())/1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff/60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff/3600), 'hour');
  return rtf.format(Math.round(diff/86400), 'day');
}
