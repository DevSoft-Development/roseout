"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type MarketingCampaignCardActionsProps = {
  campaignId: string;
  instagramCaption?: string | null;
  tiktokCaption?: string | null;
};

export default function MarketingCampaignCardActions({ campaignId, instagramCaption, tiktokCaption }: MarketingCampaignCardActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const copyCaption = async (caption: string | null | undefined) => {
    if (!caption) {
      setMessage("No caption saved for this platform yet.");
      return;
    }
    await navigator.clipboard.writeText(caption);
    setMessage("Caption copied. Upload your photo/video, then paste this caption.");
  };

  const deleteCampaign = async () => {
    if (!window.confirm("Delete this marketing campaign draft?")) return;
    setIsDeleting(true);
    const response = await fetch(`/api/admin/marketing/campaigns/${campaignId}`, { method: "DELETE" });
    if (response.ok) {
      setMessage("Campaign deleted.");
      router.refresh();
      return;
    }
    const result = await response.json().catch(() => ({}));
    setMessage(result.error || "Unable to delete campaign.");
    setIsDeleting(false);
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <a href={`/admin/dashboard/marketing?campaign_id=${campaignId}#campaign-builder`} className="rounded-full bg-[#1b1210] px-3 py-2 text-[11px] font-black text-white">
          Edit
        </a>
        <button type="button" onClick={() => copyCaption(instagramCaption)} className="rounded-full border border-black/10 bg-white px-3 py-2 text-[11px] font-black text-black/60">
          Copy Instagram Caption
        </button>
        <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" className="rounded-full border border-black/10 bg-white px-3 py-2 text-[11px] font-black text-black/60">
          Open Instagram
        </a>
        <button type="button" onClick={() => copyCaption(tiktokCaption)} className="rounded-full border border-black/10 bg-white px-3 py-2 text-[11px] font-black text-black/60">
          Copy TikTok Caption
        </button>
        <a href="https://www.tiktok.com/upload" target="_blank" rel="noopener noreferrer" className="rounded-full border border-black/10 bg-white px-3 py-2 text-[11px] font-black text-black/60">
          Open TikTok
        </a>
        <button type="button" onClick={deleteCampaign} disabled={isDeleting} className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black text-red-700 disabled:opacity-60">
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      </div>
      {message && <p className="text-xs font-bold text-emerald-700" role="status">{message}</p>}
    </div>
  );
}
