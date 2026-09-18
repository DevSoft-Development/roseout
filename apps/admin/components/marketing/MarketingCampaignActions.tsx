"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ActionState = "idle" | "saving" | "scheduled" | "sent" | "success" | "error";

type MarketingCampaignActionsProps = {
  redirectToDrafts?: boolean;
};

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formValues(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => String(value).trim()).filter(Boolean);
}

function optionalIsoDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function MarketingCampaignActions({ redirectToDrafts = true }: MarketingCampaignActionsProps) {
  const router = useRouter();
  const [action, setAction] = useState<ActionState>("idle");
  const [message, setMessage] = useState("");

  const saveDraft = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const form = event.currentTarget.closest("form");
    if (!form) return;

    setAction("saving");
    setMessage("");

    const formData = new FormData(form);
    const campaignId = formValue(formData, "campaign_id");
    const instagramCaption = formValue(formData, "instagram_caption");
    const tiktokCaption = formValue(formData, "tiktok_caption");
    const youtubeTitle = formValue(formData, "youtube_title");
    const youtubeDescription = formValue(formData, "youtube_description");

    const payload = {
      name: formValue(formData, "name"),
      campaign_type: formValue(formData, "campaign_type"),
      status: "draft",
      selected_platforms: formValues(formData, "selected_platforms"),
      audience_segment: formValue(formData, "audience_segment"),
      location_id: formValue(formData, "location_id"),
      location_source_type: formValue(formData, "location_source_table"),
      location_source_id: formValue(formData, "location_source_id"),
      location_name: formValue(formData, "location_name"),
      location_image_url: formValue(formData, "location_image_url"),
      location_category: formValue(formData, "location_category"),
      location_city: formValue(formData, "location_city"),
      location_state: formValue(formData, "location_state"),
      location_address: formValue(formData, "location_address"),
      location_description: formValue(formData, "location_description"),
      public_location_url: formValue(formData, "public_url"),
      source_platform: formValues(formData, "selected_platforms").find((platform) => platform === "instagram" || platform === "tiktok") || "instagram",
      caption_category: formValue(formData, "caption_category"),
      cta_url: formValue(formData, "public_url"),
      generated_prompt: formValue(formData, "generated_prompt"),
      social_captions: {
        instagram: instagramCaption,
        tiktok: tiktokCaption,
        youtube: youtubeDescription,
        youtube_title: youtubeTitle,
        youtube_shorts: youtubeDescription,
      },
      generated_payload: {
        instagram_caption: instagramCaption,
        tiktok_caption: tiktokCaption,
        youtube_title: youtubeTitle,
        youtube_description: youtubeDescription,
        email_subject: formValue(formData, "email_subject"),
        email_body: formValue(formData, "email_body"),
        sms_body: formValue(formData, "sms_text"),
        caption_category: formValue(formData, "caption_category"),
        hook: formValue(formData, "caption_hook"),
        link_in_bio_cta: formValue(formData, "link_in_bio_cta"),
        short_link: formValue(formData, "short_link"),
        full_url: formValue(formData, "public_url"),
      },
      hashtags: formValues(formData, "hashtags"),
      email_subject: formValue(formData, "email_subject"),
      email_body: formValue(formData, "email_body"),
      sms_text: formValue(formData, "sms_text"),
      image_url: formValue(formData, "location_image_url"),
      scheduled_at: optionalIsoDate(formValue(formData, "scheduled_at")),
    };

    try {
      const response = await fetch(campaignId ? `/api/admin/marketing/campaigns/${campaignId}` : "/api/admin/marketing/campaigns", {
        method: campaignId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save draft.");

      setAction("success");
      setMessage(result.campaign?.public_url ? `Draft saved. Bio link: ${result.campaign.public_url}` : "Draft saved. You can find it in Draft Campaigns.");
      router.refresh();
      if (redirectToDrafts) window.location.href = "/admin/dashboard/marketing?status=draft#campaigns";
    } catch (error) {
      setAction("error");
      setMessage(error instanceof Error ? error.message : "Unable to save draft.");
    }
  };

  return (
    <div className="space-y-3 lg:col-span-2">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveDraft}
          disabled={action === "saving"}
          className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {action === "saving" ? "Saving Draft..." : "Save Draft"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAction("scheduled");
            setMessage("Schedule settings captured. Save Draft first, then confirm the audience before sending.");
          }}
          className="rounded-full border border-black/10 bg-[#1b1210] px-6 py-3 text-sm font-black text-white"
        >
          Schedule
        </button>
        <button
          type="button"
          onClick={() => {
            setAction("sent");
            setMessage("Send confirmation started. The API still requires consent checks before delivery.");
          }}
          className="rounded-full border border-red-200 bg-red-50 px-6 py-3 text-sm font-black text-red-700"
        >
          Confirm &amp; Send Now
        </button>
        <a href="/admin/dashboard/marketing?status=draft#campaigns" className="rounded-full border border-black/10 bg-white px-6 py-3 text-sm font-black text-black/70">
          View Drafts
        </a>
      </div>

      {message && (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${action === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}
