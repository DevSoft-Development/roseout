"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const CHECKBOX_SELECTOR = 'input[data-search-profile-checkbox="true"]';

type Result = { verified?: number; skipped?: number; error?: string };

function profileCheckboxes(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(CHECKBOX_SELECTOR));
}

export function SearchProfileBulkVerify() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedCount, setSelectedCount] = useState(0);

  function syncCount() {
    setSelectedCount(profileCheckboxes().filter((checkbox) => checkbox.checked).length);
  }

  function selectPage(checked: boolean) {
    for (const checkbox of profileCheckboxes()) checkbox.checked = checked;
    syncCount();
  }

  async function verifySelected() {
    const locationIds = profileCheckboxes()
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value);
    if (!locationIds.length) {
      setMessage("Select at least one profile.");
      return;
    }
    if (!window.confirm(`Verify ${locationIds.length.toLocaleString()} selected profiles? Profiles that do not pass safeguards will be skipped.`)) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/location-tools/search-profiles/bulk-verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationIds }),
      });
      const result = (await response.json().catch(() => ({}))) as Result;
      if (!response.ok) throw new Error(result.error ?? "Bulk verification failed.");
      setMessage(`${result.verified ?? 0} verified; ${result.skipped ?? 0} skipped.`);
      selectPage(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
      <button type="button" onClick={() => selectPage(true)} className="rounded-full border border-white/15 px-3 py-2 text-xs font-black">Select page</button>
      <button type="button" onClick={() => selectPage(false)} className="rounded-full border border-white/15 px-3 py-2 text-xs font-black">Clear</button>
      <button type="button" disabled={busy || selectedCount === 0} onClick={verifySelected} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
        {busy ? "Verifying…" : `Verify selected (${selectedCount})`}
      </button>
      <span className="text-xs text-white/45">Only current, complete, non-review profiles with confidence of at least 55% are verified.</span>
      {message ? <p className="w-full text-sm text-white/75">{message}</p> : null}
      <span className="hidden" aria-live="polite" onClick={syncCount} />
    </div>
  );
}

export function SearchProfileBulkCheckbox({ locationId, hasProfile }: { locationId: string; hasProfile: boolean }) {
  return (
    <input
      type="checkbox"
      value={locationId}
      disabled={!hasProfile}
      data-search-profile-checkbox="true"
      aria-label={`Select profile ${locationId}`}
      onChange={() => {
        const event = new Event("search-profile-selection");
        window.dispatchEvent(event);
        const count = profileCheckboxes().filter((checkbox) => checkbox.checked).length;
        document.querySelectorAll<HTMLElement>("[data-selected-profile-count]").forEach((node) => { node.textContent = String(count); });
      }}
      className="h-4 w-4 accent-emerald-500 disabled:opacity-30"
    />
  );
}
