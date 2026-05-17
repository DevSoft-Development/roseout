"use client";

import { useState } from "react";

type MarketingSettingsFormProps = {
  initialSettings: Record<string, unknown>;
};

const textFields = [
  ["default_instagram_handle", "Default Instagram handle"],
  ["default_tiktok_handle", "Default TikTok handle"],
  ["instagram_bio_link", "Instagram bio link"],
  ["tiktok_bio_link", "TikTok bio link"],
  ["youtube_channel_link", "YouTube channel link"],
  ["default_marketing_landing_page", "Default marketing landing page"],
  ["default_short_link_domain", "Default short link domain"],
  ["default_cta_text", "Default CTA text"],
  ["default_hashtag_groups", "Default hashtag groups"],
  ["default_campaign_sender_name", "Default campaign sender name"],
  ["default_email_footer", "Default email footer"],
  ["sms_opt_out_text", "SMS opt-out text"],
] as const;

const booleanFields = [
  ["social_captions_use_link_in_bio", "Instagram/TikTok captions should use “Link in bio”"],
  ["sms_uses_short_links", "SMS should use short links"],
  ["drafts_auto_save", "Drafts should auto-save"],
] as const;

function scalarValue(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return fallback;
  return JSON.stringify(value);
}

function booleanValue(value: unknown) {
  return value === true || value === "true";
}

export default function MarketingSettingsForm({ initialSettings }: MarketingSettingsFormProps) {
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const saveSettings = async (formData: FormData) => {
    setIsSaving(true);
    setMessage("");
    const settings: Record<string, unknown> = {};
    for (const [key] of textFields) settings[key] = String(formData.get(key) || "").trim();
    for (const [key] of booleanFields) settings[key] = formData.get(key) === "on";

    try {
      const response = await fetch("/api/admin/marketing/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save settings.");
      setMessage("Marketing settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form action={saveSettings} className="grid gap-4 lg:grid-cols-2">
      {textFields.map(([key, label]) => (
        <label key={key} className={key.includes("footer") || key.includes("hashtag") ? "space-y-2 lg:col-span-2" : "space-y-2"}>
          <span className="text-xs font-black uppercase tracking-wide text-black/45">{label}</span>
          {key.includes("footer") || key.includes("hashtag") ? (
            <textarea name={key} defaultValue={scalarValue(initialSettings[key])} className="min-h-28 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-rose-400" />
          ) : (
            <input name={key} defaultValue={scalarValue(initialSettings[key])} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-rose-400" />
          )}
        </label>
      ))}

      <div className="space-y-3 lg:col-span-2">
        {booleanFields.map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-4 text-sm font-black text-black/65">
            <input name={key} type="checkbox" defaultChecked={booleanValue(initialSettings[key])} className="h-5 w-5 accent-rose-600" />
            {label}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <button type="submit" disabled={isSaving} className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/20 disabled:opacity-60">
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
        {message && <p className="text-sm font-bold text-emerald-700" role="status">{message}</p>}
      </div>
    </form>
  );
}
