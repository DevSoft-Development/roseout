"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type MarketingCampaignCardActionsProps = {
  campaignId: string;
  instagramCaption?: string | null;
  tiktokCaption?: string | null;
  publicSlug?: string | null;
  publicUrl?: string | null;
};

export default function MarketingCampaignCardActions({ campaignId, instagramCaption, tiktokCaption, publicSlug, publicUrl }: MarketingCampaignCardActionsProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const copyCaption = async (caption: string | null | undefined) => {
    if (!caption) {
      setMessage("No caption saved for this platform yet.");
      return;
    }
    await navigator.clipboard.writeText(caption);
    setMessage("Caption copied. Upload your photo/video, then paste this caption.");
  };

  const copyBioLink = async () => {
    if (!publicUrl) {
      setMessage("Save the draft again to generate a public bio link.");
      return;
    }
    await navigator.clipboard.writeText(publicUrl);
    setMessage("Bio link copied. Put this link in your Instagram/TikTok bio while this campaign is active.");
  };

  const makeActiveBioCampaign = async () => {
    if (!publicSlug) {
      setMessage("Save the draft again to generate a public slug first.");
      return;
    }
    setIsActivating(true);
    const response = await fetch("/api/admin/marketing/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { active_bio_campaign_slug: publicSlug } }),
    });
    if (response.ok) {
      setMessage("Active bio campaign updated. /go will feature this campaign first.");
      router.refresh();
    } else {
      const result = await response.json().catch(() => ({}));
      setMessage(result.error || "Unable to make this the active bio campaign.");
    }
    setIsActivating(false);
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
      {publicUrl && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-rose-700">Bio link to use</p>
          <p className="mt-1 break-all text-xs font-black text-rose-900">{publicUrl}</p>
          <p className="mt-1 text-[11px] font-bold text-rose-800/70">Put this link in your Instagram/TikTok bio while this campaign is active.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <a href={`/admin/dashboard/marketing?campaign_id=${campaignId}#campaign-builder`} className="rounded-full bg-[#1b1210] px-3 py-2 text-[11px] font-black text-white">
          Edit
        </a>
        <button type="button" onClick={copyBioLink} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-700">
          Copy Bio Link
        </button>
        <button type="button" onClick={makeActiveBioCampaign} disabled={isActivating} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-800 disabled:opacity-60">
          {isActivating ? "Activating..." : "Make Active Bio Campaign"}
        </button>
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
