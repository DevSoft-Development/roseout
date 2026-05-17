"use client";

import { useState } from "react";

type ActionState = "idle" | "draft" | "scheduled" | "sent";

const messages: Record<Exclude<ActionState, "idle">, string> = {
  draft: "Draft saved locally. Connect this form to the campaign API when persistence is enabled.",
  scheduled: "Schedule settings captured. Confirm the audience before sending.",
  sent: "Send confirmation started. The API still requires consent checks before delivery.",
};

export default function MarketingCampaignActions() {
  const [action, setAction] = useState<ActionState>("idle");

  const handleAction = (nextAction: Exclude<ActionState, "idle">) => {
    setAction(nextAction);
  };

  return (
    <div className="space-y-3 lg:col-span-2">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => handleAction("draft")}
          className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/20"
        >
          Save Draft
        </button>
        <button
          type="button"
          onClick={() => handleAction("scheduled")}
          className="rounded-full border border-black/10 bg-[#1b1210] px-6 py-3 text-sm font-black text-white"
        >
          Schedule
        </button>
        <button
          type="button"
          onClick={() => handleAction("sent")}
          className="rounded-full border border-red-200 bg-red-50 px-6 py-3 text-sm font-black text-red-700"
        >
          Confirm &amp; Send Now
        </button>
      </div>

      {action !== "idle" && (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800" role="status">
          {messages[action]}
        </p>
      )}
    </div>
  );
}
