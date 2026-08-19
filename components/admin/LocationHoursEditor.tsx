"use client";

import { useMemo, useState } from "react";
import LocationEditorHoursPanel from "@/components/location-editor/LocationEditorHoursPanel";

function prettyJson(value: unknown) {
  if (!value) return "";
  try {
    return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value, null, 2);
  } catch {
    return String(value);
  }
}

export default function LocationHoursEditor({
  value,
  disabled = false,
  inputName = "operating_hours_json",
  theme = "dark",
  status,
  onValidJsonChange,
}: {
  value: unknown;
  disabled?: boolean;
  inputName?: string;
  textAreaClassName?: string;
  theme?: "dark" | "light";
  status?: Record<string, unknown>;
  onValidJsonChange?: (value: Record<string, any> | null, valid: boolean) => void;
}) {
  const initial = useMemo(() => value ?? null, [value]);
  const [hours, setHours] = useState<unknown>(initial);
  const dark = theme === "dark";
  const importedHours =
    status?.google_regular_opening_hours ??
    status?.google_opening_hours ??
    status?.google_hours ??
    status?.regularOpeningHours ??
    status?.weekday_text;

  function update(next: unknown) {
    setHours(next);
    onValidJsonChange?.((next as Record<string, any>) ?? null, true);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={inputName} value={hours ? JSON.stringify(hours) : ""} />
      <input type="hidden" name={`${inputName}_valid`} value="true" />

      <div className={disabled ? "pointer-events-none opacity-60" : ""}>
        <LocationEditorHoursPanel
          value={hours}
          importedHours={importedHours}
          isAdmin={false}
          onChange={(next) => update(next)}
        />
      </div>

      {status ? (
        <details
          className={`rounded-2xl border p-4 text-xs leading-5 ${
            dark
              ? "border-white/10 bg-black/20 text-white/55"
              : "border-black/10 bg-white text-black/55"
          }`}
        >
          <summary className="cursor-pointer text-sm font-black">
            Hours source & diagnostics
          </summary>
          <div className="mt-3 grid gap-1">
            <p>Backfill status: {String(status.hours_backfill_status || "—")}</p>
            <p>Hours confidence: {String(status.hours_confidence || "—")}</p>
            <p>
              Hours source: {String(status.hours_source || (importedHours ? "Google Places" : "—"))}
            </p>
            <p>Last backfilled: {String(status.hours_last_backfilled_at || "—")}</p>
            {status.hours_backfill_error ? (
              <p>Backfill error: {String(status.hours_backfill_error)}</p>
            ) : null}
          </div>
          <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-black/20 p-3 font-mono text-[11px]">
            {prettyJson(hours)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
