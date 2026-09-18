"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Anchor = {
  id: string;
  canonical_name: string;
  anchor_type: string;
  city: string | null;
  state: string | null;
  market: string | null;
  review_status: string;
  latitude: number;
  longitude: number;
};

type Props = {
  anchors: Anchor[];
};

export default function CuratedReviewClient({ anchors }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  const pendingIds = useMemo(
    () => anchors.filter((anchor) => anchor.review_status === "pending_review").map((anchor) => anchor.id),
    [anchors],
  );
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPending() {
    setSelected((current) => {
      const next = new Set(current);
      if (allPendingSelected) pendingIds.forEach((id) => next.delete(id));
      else pendingIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function review(action: "approve" | "reject" | "pending_review") {
    if (!selected.size || working) return;
    setWorking(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/search-anchors/curated-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action }),
      });
      const payload = (await response.json()) as { success?: boolean; updated?: number; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to update curated anchors.");
      setStatus(`${payload.updated ?? 0} curated anchors updated.`);
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update curated anchors.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <button type="button" onClick={toggleAllPending} disabled={!pendingIds.length || working} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {allPendingSelected ? "Clear pending selection" : `Select all pending (${pendingIds.length})`}
        </button>
        <button type="button" onClick={() => void review("approve")} disabled={!selected.size || working} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Approve selected ({selected.size})
        </button>
        <button type="button" onClick={() => void review("reject")} disabled={!selected.size || working} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Reject selected
        </button>
        <button type="button" onClick={() => void review("pending_review")} disabled={!selected.size || working} className="rounded-xl border border-amber-700 px-4 py-2 text-sm font-semibold text-amber-200 disabled:opacity-50">
          Return to pending
        </button>
        {status && <p className="w-full text-sm text-zinc-300">{status}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="bg-zinc-900 text-xs uppercase text-zinc-400">
              <tr>
                <th className="px-4 py-3">Select</th>
                <th className="px-4 py-3">Anchor</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Coordinates</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {anchors.map((anchor) => (
                <tr key={anchor.id} className="border-t border-zinc-900 align-top hover:bg-zinc-900/40">
                  <td className="px-4 py-4">
                    <input aria-label={`Select ${anchor.canonical_name}`} type="checkbox" checked={selected.has(anchor.id)} onChange={() => toggle(anchor.id)} className="h-4 w-4" />
                  </td>
                  <td className="px-4 py-4"><p className="font-medium text-white">{anchor.canonical_name}</p><p className="mt-1 text-xs text-zinc-500">{anchor.anchor_type}</p></td>
                  <td className="px-4 py-4 text-zinc-300"><p>{anchor.city ?? "—"}, {anchor.state ?? "—"}</p><p className="mt-1 text-xs text-zinc-500">{anchor.market ?? "Unassigned market"}</p></td>
                  <td className="px-4 py-4 text-zinc-300">{Number(anchor.latitude).toFixed(5)}, {Number(anchor.longitude).toFixed(5)}</td>
                  <td className="px-4 py-4"><span className={`rounded-full border px-2 py-1 text-xs capitalize ${anchor.review_status === "approved" ? "border-emerald-800 text-emerald-300" : anchor.review_status === "rejected" ? "border-red-800 text-red-300" : "border-amber-800 text-amber-300"}`}>{anchor.review_status.replaceAll("_", " ")}</span></td>
                </tr>
              ))}
              {!anchors.length && <tr><td colSpan={5} className="px-6 py-12 text-center text-zinc-500">No curated anchors found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
