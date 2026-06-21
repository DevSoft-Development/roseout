"use client";

import { useEffect, useMemo, useState } from "react";
import { humanTextToOperatingHoursJson, operatingHoursJsonToHumanText, validateHumanHoursText } from "@/lib/location-hours";

const example = `Monday - 8:30 AM - 10:30 PM
Tuesday - 8:30 AM - 10:30 PM
Wednesday - 8:30 AM - 10:30 PM
Thursday - 8:30 AM - 10:30 PM
Friday - 8:30 AM - 11:30 PM
Saturday - 10:00 AM - 11:30 PM
Sunday - 10:00 AM - 9:00 PM`;

function prettyJson(value: unknown) {
  if (!value) return "";
  try { return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value, null, 2); } catch { return String(value); }
}

export default function LocationHoursEditor({ value, disabled = false, inputName = "operating_hours_json", textAreaClassName, theme = "dark", status, onValidJsonChange }: { value: unknown; disabled?: boolean; inputName?: string; textAreaClassName?: string; theme?: "dark" | "light"; status?: Record<string, unknown>; onValidJsonChange?: (value: Record<string, string[]> | null, valid: boolean) => void }) {
  const initialText = useMemo(() => operatingHoursJsonToHumanText(value), [value]);
  const [text, setText] = useState(initialText);
  const validation = useMemo(() => validateHumanHoursText(text), [text]);
  const parsedValue = useMemo(() => validation.valid ? humanTextToOperatingHoursJson(text) : null, [text, validation.valid]);
  const jsonValue = parsedValue ? JSON.stringify(parsedValue) : "";
  useEffect(() => { onValidJsonChange?.(parsedValue, validation.valid); }, [parsedValue, validation.valid, onValidJsonChange]);
  const dark = theme === "dark";
  const inputClass = textAreaClassName || `w-full rounded-2xl border ${dark ? "border-white/10 bg-black/30 text-white" : "border-black/10 bg-white text-black"} px-4 py-3 outline-none disabled:opacity-60`;
  const googleRegular = status?.google_regular_opening_hours;
  const hasOperatingHours = Boolean(initialText.trim());

  return <div className="space-y-3">
    <label className={`block space-y-2 text-sm font-bold ${dark ? "text-white/65" : "text-black/65"}`}>
      <span>Weekly Hours</span>
      <textarea value={text} onChange={(event) => setText(event.target.value)} disabled={disabled} rows={8} placeholder={example} className={inputClass} />
    </label>
    <input type="hidden" name={inputName} value={jsonValue} />
    <input type="hidden" name={`${inputName}_valid`} value={validation.valid ? "true" : "false"} />
    {!validation.valid ? <div className={`rounded-2xl border p-3 text-sm font-bold ${dark ? "border-amber-300/25 bg-amber-500/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{validation.errors.map((error) => <p key={`${error.lineNumber}-${error.line}`}>{error.message}<br /><span className="font-medium opacity-80">Invalid line: {error.line}</span></p>)}</div> : null}
    <div className={`rounded-2xl border p-3 text-xs leading-5 ${dark ? "border-white/10 bg-black/20 text-white/55" : "border-black/10 bg-white text-black/55"}`}>
      <p className="font-black">Correct format:</p><pre className="mt-2 whitespace-pre-wrap font-sans">{example}</pre>
      <p className="mt-2">Use AM/PM. Use one day per line. Use Closed for closed days. For split hours, separate ranges with a comma.</p>
    </div>
    {status ? <div className={`rounded-2xl border p-3 text-xs leading-5 ${dark ? "border-white/10 bg-black/20 text-white/60" : "border-black/10 bg-white text-black/60"}`}>
      <p className="font-black">Google hours status</p>
      <p>{googleRegular ? (hasOperatingHours ? "Google hours copied into operating hours" : "Google hours available but not copied yet") : "No Google hours payload found."}</p>
      <p>Backfill status: {String(status.hours_backfill_status || "—")}</p>
      <p>Hours confidence: {String(status.hours_confidence || "—")}</p>
      <p>Hours source: {String(status.hours_source || (googleRegular ? "Google Places" : "—"))}</p>
      <p>Last backfilled at: {String(status.hours_last_backfilled_at || "—")}</p>
      {status.hours_backfill_error ? <p>Backfill error: {String(status.hours_backfill_error)}</p> : null}
    </div> : null}
    <details className={`rounded-2xl border p-3 ${dark ? "border-white/10 bg-black/20 text-white/65" : "border-black/10 bg-white text-black/65"}`}>
      <summary className="cursor-pointer text-sm font-black">Advanced JSON</summary>
      <textarea readOnly rows={6} value={prettyJson(value)} className={`${inputClass} mt-3 font-mono text-xs`} />
    </details>
  </div>;
}
