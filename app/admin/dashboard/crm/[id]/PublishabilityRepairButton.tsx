"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Action = "enrich" | "repair" | "approve" | "check_duplicate" | "clear_stale_duplicate";

type DuplicateState = {
  duplicateStatus?: string;
  hasReviewRows?: boolean;
  hasBlockingReviewRows?: boolean;
  staleDuplicateFlag?: boolean;
  message?: string;
};

export default function PublishabilityRepairButton({
  locationId,
  eligible,
}: {
  locationId: string;
  eligible: boolean;
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<Action | null>(null);
  const [msg, setMsg] = useState("");
  const [duplicateState, setDuplicateState] = useState<DuplicateState | null>(null);

  async function checkDuplicateStatus(silent = false) {
    if (!silent) setBusyAction("check_duplicate");
    try {
      const response = await fetch("/api/admin/locations/duplicate-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "check", locationId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        if (!silent) setMsg(data.error || "Could not check duplicate status.");
        return;
      }
      setDuplicateState(data);
      if (!silent) setMsg(data.message || "Duplicate status checked.");
    } catch {
      if (!silent) setMsg("Could not check duplicate status.");
    } finally {
      if (!silent) setBusyAction(null);
    }
  }

  useEffect(() => {
    void checkDuplicateStatus(true);
  }, [locationId]);

  async function run(action: Action) {
    setBusyAction(action);
    setMsg("");
    try {
      if (action === "check_duplicate") {
        await checkDuplicateStatus();
        return;
      }

      if (action === "clear_stale_duplicate") {
        const response = await fetch("/api/admin/locations/duplicate-status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "clear_stale", locationId }),
        });
        const data = await response.json().catch(() => ({}));
        setMsg(data.message || data.error || "Could not clear the duplicate flag.");
        if (response.ok && data.success !== false) {
          await checkDuplicateStatus(true);
          router.refresh();
        }
        return;
      }

      const isEnrichment = action === "enrich";
      const response = await fetch(
        isEnrichment
          ? "/api/admin/locations/google-enrichment/single"
          : "/api/admin/locations/repair-publishability",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            isEnrichment ? { locationId } : { action, locationId },
          ),
        },
      );
      const data = await response.json().catch(() => ({}));
      setMsg(
        data.message ||
          (data.success
            ? isEnrichment
              ? "Google enrichment completed for this location."
              : "Updated publishability."
            : data.error || "Action failed"),
      );
      if (response.ok && data.success !== false) {
        await checkDuplicateStatus(true);
        router.refresh();
      }
    } catch {
      setMsg(
        action === "enrich"
          ? "Google enrichment failed for this location."
          : "The publishability request failed.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  const busy = busyAction !== null;
  const duplicateStatus = duplicateState?.duplicateStatus || "checking";

  return (
    <div className="flex max-w-2xl flex-wrap items-center justify-end gap-2">
      <div className="basis-full rounded-2xl border border-white/10 bg-black/25 p-3 text-left">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
              Duplicate review status
            </p>
            <p className="mt-1 text-xs font-bold text-white/75">
              Database flag: {duplicateStatus.replace(/_/g, " ")}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/50">
              {duplicateState?.message || "Checking whether this location has a duplicate-review pair…"}
            </p>
          </div>
          <Link
            href={`/admin/dashboard/settings/location-tools/duplicates?q=${encodeURIComponent(locationId)}`}
            className="rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white/70"
          >
            Open duplicates tool
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={() => run("check_duplicate")}
            className="rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white/70 disabled:opacity-50"
          >
            {busyAction === "check_duplicate" ? "Checking…" : "Recheck duplicate status"}
          </button>
          {duplicateState?.staleDuplicateFlag ? (
            <button
              disabled={busy}
              onClick={() => run("clear_stale_duplicate")}
              className="rounded-full bg-amber-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
            >
              {busyAction === "clear_stale_duplicate" ? "Clearing…" : "Clear stale duplicate flag"}
            </button>
          ) : null}
        </div>
      </div>

      <button
        disabled={busy}
        onClick={() => run("enrich")}
        className="rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-500 disabled:opacity-50"
      >
        {busyAction === "enrich" ? "Enriching this location…" : "Run Google enrichment"}
      </button>
      <button
        disabled={busy}
        onClick={() => run("repair")}
        className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/80 disabled:opacity-50"
      >
        {busyAction === "repair" ? "Repairing…" : "Repair publishability"}
      </button>
      {eligible ? (
        <button
          disabled={busy}
          onClick={() => run("approve")}
          className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
        >
          {busyAction === "approve" ? "Approving…" : "Approve for search"}
        </button>
      ) : (
        <button
          disabled
          className="rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white/40"
        >
          Needs Fix
        </button>
      )}
      {msg ? (
        <span className="basis-full text-right text-xs font-bold leading-5 text-white/70">
          {msg}
        </span>
      ) : null}
    </div>
  );
}
