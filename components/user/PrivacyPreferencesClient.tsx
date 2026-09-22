"use client";
import { useEffect, useState } from "react";

type Preferences = { personalizationEnabled: boolean; searchHistoryPersonalizationEnabled: boolean };

export default function PrivacyPreferencesClient() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/account/privacy-preferences")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => setPreferences(payload.preferences))
      .catch(() => setMessage("Privacy controls are temporarily unavailable."));
  }, []);

  async function update(next: Partial<Preferences>) {
    if (!preferences || saving) return;
    const previous = preferences;
    const optimistic = { ...preferences, ...next };
    setPreferences(optimistic);
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/account/privacy-preferences", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error();
      setPreferences(payload.preferences);
      setMessage("Saved.");
    } catch {
      setPreferences(previous);
      setMessage("We could not save that setting.");
    } finally { setSaving(false); }
  }

  if (!preferences) return <p className="mt-4 text-sm text-white/45">{message || "Loading privacy controls…"}</p>;
  return (
    <div className="mt-5 space-y-4">
      <PreferenceRow
        title="Personalized recommendations"
        description="Use your TheOutHaven activity, such as saves and completed outings, to improve suggestions."
        enabled={preferences.personalizationEnabled}
        disabled={saving}
        onChange={(value) => update({ personalizationEnabled: value })}
      />
      <PreferenceRow
        title="Use search history"
        description="Allow previous search activity to help improve future suggestions."
        enabled={preferences.searchHistoryPersonalizationEnabled}
        disabled={saving || !preferences.personalizationEnabled}
        onChange={(value) => update({ searchHistoryPersonalizationEnabled: value })}
      />
      <button type="button" onClick={() => { sessionStorage.setItem("theouthaven_search_without_personalization", "1"); setMessage("Your next search will run without personalization."); }} className="rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white/75">
        Search once without personalization
      </button>
      {message ? <p className="text-xs font-semibold text-white/45">{message}</p> : null}
    </div>
  );
}

function PreferenceRow({ title, description, enabled, disabled, onChange }: { title: string; description: string; enabled: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div><p className="font-black">{title}</p><p className="mt-1 max-w-xl text-xs font-semibold leading-5 text-white/45">{description}</p></div><button type="button" role="switch" aria-checked={enabled} disabled={disabled} onClick={() => onChange(!enabled)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? "bg-[#e1062a]" : "bg-white/15"} disabled:opacity-40`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${enabled ? "left-6" : "left-1"}`} /></button></div>;
}
