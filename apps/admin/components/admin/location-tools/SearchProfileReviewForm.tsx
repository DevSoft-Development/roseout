"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  locationId: string;
  primaryDomain: string;
};

function terms(value: string): string[] {
  return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
}

export function SearchProfileReviewForm({ locationId, primaryDomain }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [domain, setDomain] = useState(primaryDomain || "activity");
  const [addCategories, setAddCategories] = useState("");
  const [removeCategories, setRemoveCategories] = useState("");
  const [addFeatures, setAddFeatures] = useState("");
  const [removeFeatures, setRemoveFeatures] = useState("");
  const [note, setNote] = useState("");

  async function applyReview() {
    if (!window.confirm("Apply these profile changes and mark this profile verified?")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/location-tools/search-profiles/${locationId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          primaryDomain: domain,
          add: {
            canonicalTerms: terms(addCategories),
            features: terms(addFeatures),
          },
          remove: {
            canonicalTerms: terms(removeCategories),
            features: terms(removeFeatures),
          },
          note,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Profile review could not be applied.");
      setMessage("Changes applied and profile verified.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile review could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5">
      <div>
        <label className="mb-1 block text-xs font-black uppercase tracking-wide text-white/50">Primary domain</label>
        <select value={domain} onChange={(event) => setDomain(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2">
          <option value="restaurant">Restaurant</option>
          <option value="activity">Activity</option>
          <option value="nightlife">Nightlife</option>
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Add canonical terms" value={addCategories} onChange={setAddCategories} />
        <Field label="Remove canonical terms" value={removeCategories} onChange={setRemoveCategories} />
        <Field label="Add features" value={addFeatures} onChange={setAddFeatures} />
        <Field label="Remove features" value={removeFeatures} onChange={setRemoveFeatures} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-black uppercase tracking-wide text-white/50">Review note</label>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2" placeholder="Why these changes are correct" />
      </div>
      <button type="button" disabled={busy} onClick={applyReview} className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
        {busy ? "Applying…" : "Apply changes and verify"}
      </button>
      {message ? <p className="text-sm text-white/75">{message}</p> : null}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-black uppercase tracking-wide text-white/50">{label}</label>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2" placeholder="Comma-separated terms" />
    </div>
  );
}
