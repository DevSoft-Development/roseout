"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FeatureOpportunityButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function feature() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/marketing/opportunities/${opportunityId}/feature`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not create content.");
      router.push(body.href);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create content.");
    } finally {
      setBusy(false);
    }
  }

  return <div><button type="button" disabled={busy} onClick={() => void feature()} className="min-h-11 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Feature on TheOutHaven"}</button>{error ? <div className="mt-2 text-xs font-medium text-red-700">{error}</div> : null}</div>;
}
