"use client";

import { useMemo, useState } from "react";
import LocationEditorHoursPanel from "@/components/location-editor/LocationEditorHoursPanel";

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
            About these hours
          </summary>
          <div className="mt-3 grid gap-2">
            <p>
              Source: {String(status.hours_source ? "Verified business information" : importedHours ? "Google business listing" : "Saved manually")}
            </p>
            <p>
              Last checked: {status.hours_last_backfilled_at ? new Date(String(status.hours_last_backfilled_at)).toLocaleDateString() : "Not available"}
            </p>
            {status.hours_backfill_error ? (
              <p className="text-amber-200">These hours may need a quick review.</p>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
