"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ADMIN_APPEARANCE_EVENT,
  ADMIN_APPEARANCE_STORAGE_KEY,
  DEFAULT_ADMIN_APPEARANCE,
  normalizeAdminAppearance,
  resolveAdminTheme,
  type AdminAppearanceSettings,
} from "@/lib/admin-appearance";

function readAppearance(): AdminAppearanceSettings {
  if (typeof window === "undefined") return DEFAULT_ADMIN_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(ADMIN_APPEARANCE_STORAGE_KEY);
    return raw ? normalizeAdminAppearance(JSON.parse(raw)) : DEFAULT_ADMIN_APPEARANCE;
  } catch {
    return DEFAULT_ADMIN_APPEARANCE;
  }
}

export default function AdminAppearanceProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AdminAppearanceSettings>(DEFAULT_ADMIN_APPEARANCE);
  const [now, setNow] = useState(() => new Date(0));
  const resolvedTheme = useMemo(() => resolveAdminTheme(settings, now), [settings, now]);

  useEffect(() => {
    const sync = () => {
      setSettings(readAppearance());
      setNow(new Date());
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(ADMIN_APPEARANCE_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(ADMIN_APPEARANCE_EVENT, sync as EventListener);
    };
  }, []);

  useEffect(() => {
    if (settings.mode !== "auto") return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [settings.mode]);

  return (
    <div
      className="admin-theme min-h-screen overflow-x-hidden md:pl-[76px] xl:pl-60"
      data-admin-theme={resolvedTheme}
      data-admin-theme-mode={settings.mode}
    >
      {children}
    </div>
  );
}
