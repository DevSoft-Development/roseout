"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Moon, Sun, SunMoon } from "lucide-react";
import {
  ADMIN_APPEARANCE_EVENT,
  ADMIN_APPEARANCE_STORAGE_KEY,
  DEFAULT_ADMIN_APPEARANCE,
  normalizeAdminAppearance,
  resolveAdminTheme,
  type AdminAppearanceMode,
  type AdminAppearanceSettings,
} from "@/lib/admin-appearance";

const modes: Array<{ id: AdminAppearanceMode; label: string; helper: string; icon: typeof Sun }> = [
  { id: "auto", label: "Automatic", helper: "Use light mode during your configured daytime hours and dark mode at night.", icon: SunMoon },
  { id: "light", label: "Light", helper: "Keep the admin workspace in light mode at all times.", icon: Sun },
  { id: "dark", label: "Dark", helper: "Keep the admin workspace in dark mode at all times.", icon: Moon },
];

function loadSettings() {
  try {
    const raw = window.localStorage.getItem(ADMIN_APPEARANCE_STORAGE_KEY);
    return raw ? normalizeAdminAppearance(JSON.parse(raw)) : DEFAULT_ADMIN_APPEARANCE;
  } catch {
    return DEFAULT_ADMIN_APPEARANCE;
  }
}

export default function AdminAppearanceSettings() {
  const [settings, setSettings] = useState<AdminAppearanceSettings>(DEFAULT_ADMIN_APPEARANCE);
  const [now, setNow] = useState(() => new Date(0));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setNow(new Date());
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const resolved = useMemo(() => resolveAdminTheme(settings, now), [settings, now]);
  const hasLocalTime = now.getTime() !== 0;

  function save() {
    const normalized = normalizeAdminAppearance(settings);
    window.localStorage.setItem(ADMIN_APPEARANCE_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new Event(ADMIN_APPEARANCE_EVENT));
    setSettings(normalized);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  return (
    <section className="admin-card rounded-3xl p-5 sm:p-6 md:col-span-2">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="admin-kicker text-xs font-black uppercase tracking-[0.24em]">Appearance</p>
          <h2 className="mt-2 text-2xl font-black">Admin light & dark mode</h2>
          <p className="admin-muted mt-2 text-sm leading-6">
            Automatic mode follows the current time on this device. The default daytime window is 7:00 AM to 7:00 PM, and you can change both transition times below.
          </p>
        </div>
        <div className="admin-panel rounded-2xl px-4 py-3 text-sm">
          <div className="flex items-center gap-2 font-black"><Clock3 className="h-4 w-4" />Current result: <span className="capitalize">{hasLocalTime ? resolved : "checking"}</span></div>
          <p className="admin-muted mt-1 text-xs">{hasLocalTime ? `${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} local time` : "Reading local time…"}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {modes.map((mode) => {
          const Icon = mode.icon;
          const active = settings.mode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setSettings((current) => ({ ...current, mode: mode.id }))}
              aria-pressed={active}
              className={`rounded-2xl border p-4 text-left transition ${active ? "border-rose-400/50 bg-rose-500/10" : "border-white/10 bg-white/[0.035] hover:border-rose-300/30"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-300/20 bg-rose-500/10 text-rose-200"><Icon className="h-5 w-5" /></span>
                {active ? <Check className="h-5 w-5 text-rose-300" /> : null}
              </div>
              <p className="mt-3 font-black">{mode.label}</p>
              <p className="admin-muted mt-1 text-xs leading-5">{mode.helper}</p>
            </button>
          );
        })}
      </div>

      <div className={`mt-5 grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2 ${settings.mode === "auto" ? "" : "opacity-55"}`}>
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.18em]">Light mode starts</span>
          <input
            type="time"
            value={settings.lightStart}
            disabled={settings.mode !== "auto"}
            onChange={(event) => setSettings((current) => ({ ...current, lightStart: event.target.value }))}
            className="admin-field mt-2 min-h-11 w-full rounded-xl px-3 py-2 text-sm font-bold"
          />
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.18em]">Dark mode starts</span>
          <input
            type="time"
            value={settings.darkStart}
            disabled={settings.mode !== "auto"}
            onChange={(event) => setSettings((current) => ({ ...current, darkStart: event.target.value }))}
            className="admin-field mt-2 min-h-11 w-full rounded-xl px-3 py-2 text-sm font-bold"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="admin-muted text-xs">This preference is saved on this browser/device and applies across the authenticated Admin workspace.</p>
        <button type="button" onClick={save} className="admin-primary inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-2.5 text-sm">
          {saved ? "Saved" : "Save appearance"}
        </button>
      </div>
    </section>
  );
}
