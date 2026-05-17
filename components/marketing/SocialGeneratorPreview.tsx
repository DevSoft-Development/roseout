"use client";

import { useMemo, useState } from "react";
import LinkedCaptionPreview from "@/components/marketing/LinkedCaptionPreview";
import {
  buildMarketingSocialPackage,
  captionCategories,
  hasRawUrl,
  type CaptionCategory,
  type MarketingSocialPackage,
} from "@/lib/marketing/caption-templates";

type Platform = "instagram" | "tiktok" | "youtube" | "email" | "sms";

type SocialGeneratorPreviewProps = {
  initialPackage: MarketingSocialPackage;
  locationName: string;
  locationCategory: string;
  city: string;
  state: string;
  address: string;
  description: string;
  fullUrl: string;
};

const platformLabels: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  email: "Email",
  sms: "SMS",
};

function platformText(platform: Platform, generated: MarketingSocialPackage) {
  if (platform === "instagram") return generated.instagram_caption;
  if (platform === "tiktok") return generated.tiktok_caption;
  if (platform === "youtube") return `${generated.youtube_title}\n\n${generated.youtube_description}`;
  if (platform === "email") return `${generated.email_subject}\n\n${generated.email_body}`;
  return generated.sms_body;
}

export default function SocialGeneratorPreview({
  initialPackage,
  locationName,
  locationCategory,
  city,
  state,
  address,
  description,
  fullUrl,
}: SocialGeneratorPreviewProps) {
  const [selectedCategory, setSelectedCategory] = useState<CaptionCategory>(initialPackage.caption_category);
  const [generated, setGenerated] = useState(initialPackage);
  const [activePlatform, setActivePlatform] = useState<Platform>("instagram");
  const [copyStatus, setCopyStatus] = useState<string>("");
  const [isRegenerating, setIsRegenerating] = useState(false);

  const previewText = useMemo(() => platformText(activePlatform, generated), [activePlatform, generated]);
  const showRawUrlWarning = (activePlatform === "instagram" || activePlatform === "tiktok") && hasRawUrl(previewText);

  const regenerateCaption = async () => {
    setIsRegenerating(true);
    setCopyStatus("");

    const nextPackage = buildMarketingSocialPackage({
      locationName,
      category: locationCategory,
      city,
      state,
      address,
      description,
      fullUrl,
      captionCategory: selectedCategory,
    });

    setGenerated(nextPackage);
    setActivePlatform("instagram");
    setIsRegenerating(false);
  };

  const copyPlatform = async (platform: Platform) => {
    const text = platformText(platform, generated);
    await navigator.clipboard.writeText(text);
    setCopyStatus(`${platformLabels[platform]} copy copied.`);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wide text-black/45">Caption category</span>
          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value as CaptionCategory)}
            className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-rose-400"
          >
            {captionCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={regenerateCaption}
          disabled={isRegenerating}
          className="rounded-full bg-[#1b1210] px-5 py-3 text-sm font-black text-white transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRegenerating ? "Regenerating..." : "Regenerate Caption"}
        </button>
      </div>

      <div className="rounded-[1.25rem] border border-black/10 bg-[#fffaf6] p-4">
        <p className="text-[10px] font-black uppercase tracking-wide text-black/35">Viral hook</p>
        <p className="mt-1 text-sm font-black text-black/70">{generated.hook}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black text-black/50">
          <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">{generated.caption_category}</span>
          <span className="rounded-full bg-black/5 px-3 py-1">IG/TikTok: {generated.link_in_bio_cta}</span>
          <span className="rounded-full bg-black/5 px-3 py-1">SMS: {generated.short_link}</span>
        </div>
      </div>

      <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-4 text-white">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(Object.keys(platformLabels) as Platform[]).map((platform) => (
            <button
              key={platform}
              type="button"
              onClick={() => setActivePlatform(platform)}
              className={`shrink-0 rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-wide transition ${
                activePlatform === platform
                  ? "border-rose-400 bg-rose-600 text-white"
                  : "border-white/10 bg-white/[0.06] text-white/55 hover:text-white"
              }`}
            >
              {platformLabels[platform]}
            </button>
          ))}
        </div>

        {showRawUrlWarning && (
          <p className="mt-3 rounded-2xl border border-amber-300/40 bg-amber-300/15 px-3 py-2 text-xs font-bold text-amber-100" role="alert">
            Warning: Instagram/TikTok previews should not contain raw URLs. Use “Link in bio” instead.
          </p>
        )}

        <div className="mt-4 rounded-[1rem] border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] font-black uppercase tracking-wide text-white/40">{platformLabels[activePlatform]} preview</p>
          <LinkedCaptionPreview text={previewText} className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/75" />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(platformLabels) as Platform[]).map((platform) => (
            <button
              key={platform}
              type="button"
              onClick={() => copyPlatform(platform)}
              className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-2 text-[11px] font-black text-white/65 transition hover:bg-white/10 hover:text-white"
            >
              Copy {platformLabels[platform]}
            </button>
          ))}
        </div>
        {copyStatus && <p className="mt-3 text-xs font-bold text-emerald-200" role="status">{copyStatus}</p>}
      </div>
    </div>
  );
}
