"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const CHECKBOX_SELECTOR = 'input[data-search-profile-checkbox="true"]';
const SELECTION_EVENT = "search-profile-selection";

type Detail = { locationId: string; outcome: "verified" | "corrected" | "skipped"; severity: string; reasons: string[] };
type Result = { verified?: number; corrected?: number; skipped?: number; details?: Detail[]; error?: string };

function profileCheckboxes(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(CHECKBOX_SELECTOR));
}

export function SearchProfileBulkVerify({ isSuperadmin = false }: { isSuperadmin?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState<Detail[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);

  function syncCount() { setSelectedCount(profileCheckboxes().filter((checkbox) => checkbox.checked).length); }
  useEffect(() => {
    window.addEventListener(SELECTION_EVENT, syncCount);
    syncCount();
    return () => window.removeEventListener(SELECTION_EVENT, syncCount);
  }, []);

  function selectPage(checked: boolean) {
    for (const checkbox of profileCheckboxes()) if (!checkbox.disabled) checkbox.checked = checked;
    syncCount();
  }

  function selectedIds() {
    return profileCheckboxes().filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
  }

  async function run(action: "verify" | "apply_safe", override = false) {
    const locationIds = selectedIds();
    if (!locationIds.length) { setMessage("Select at least one profile."); return; }
    let reason = "";
    if (override) {
      reason = window.prompt("Required: explain why these profiles should be verified despite blocking conflicts.")?.trim() ?? "";
      if (reason.length < 10) { setMessage("Superadmin override requires a reason of at least 10 characters."); return; }
    }
    const label = action === "apply_safe" ? "apply safe suggested corrections to" : override ? "override safeguards and verify" : "verify";
    if (!window.confirm(`${label} ${locationIds.length.toLocaleString()} selected profiles?`)) return;

    setBusy(true); setMessage(""); setDetails([]);
    try {
      const response = await fetch("/api/admin/location-tools/search-profiles/bulk-verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationIds, action, override, reason }),
      });
      const result = (await response.json().catch(() => ({}))) as Result;
      if (!response.ok) throw new Error(result.error ?? "Bulk profile action failed.");
      setMessage(`${result.verified ?? 0} verified; ${result.corrected ?? 0} corrected; ${result.skipped ?? 0} skipped.`);
      setDetails(result.details ?? []);
      selectPage(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk profile action failed.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => selectPage(true)} className="rounded-full border border-white/15 px-3 py-2 text-xs font-black">Select page</button>
        <button type="button" onClick={() => selectPage(false)} className="rounded-full border border-white/15 px-3 py-2 text-xs font-black">Clear</button>
        <button type="button" disabled={busy || selectedCount === 0} onClick={() => run("verify")} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Verify selected ({selectedCount})</button>
        <button type="button" disabled={busy || selectedCount === 0} onClick={() => run("apply_safe")} className="rounded-full bg-sky-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Apply safe corrections</button>
        {isSuperadmin ? <button type="button" disabled={busy || selectedCount === 0} onClick={() => run("verify", true)} className="rounded-full border border-amber-300/40 px-4 py-2 text-xs font-black text-amber-100 disabled:opacity-50">Superadmin verify anyway</button> : null}
      </div>
      <p className="mt-2 text-xs text-white/45">Blocking conflicts stay skipped. Harmless warnings can be verified. Safe corrections only use deterministic values already stored on the profile.</p>
      {message ? <p className="mt-2 text-sm text-white/80">{message}</p> : null}
      {details.length ? (
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-white/10">
          {details.map((detail) => (
            <div key={detail.locationId} className="border-b border-white/10 p-2 text-xs last:border-b-0">
              <div className="flex gap-2"><code>{detail.locationId}</code><strong>{detail.outcome}</strong><span className={detail.severity === "blocking" ? "text-red-300" : detail.severity === "warning" ? "text-amber-200" : "text-emerald-200"}>{detail.severity}</span></div>
              <p className="mt-1 text-white/55">{detail.reasons.join("; ") || "No blocking reasons"}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SearchProfileBulkCheckbox({ locationId, hasProfile }: { locationId: string; hasProfile: boolean }) {
  return <input type="checkbox" value={locationId} disabled={!hasProfile} data-search-profile-checkbox="true" aria-label={`Select profile ${locationId}`} onChange={() => window.dispatchEvent(new Event(SELECTION_EVENT))} className="h-4 w-4 accent-emerald-500 disabled:opacity-30" />;
}
