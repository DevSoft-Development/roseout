export type AdminAppearanceMode = "auto" | "light" | "dark";
export type AdminResolvedTheme = "light" | "dark";

export type AdminAppearanceSettings = {
  mode: AdminAppearanceMode;
  lightStart: string;
  darkStart: string;
};

export const ADMIN_APPEARANCE_STORAGE_KEY = "theouthaven.admin.appearance.v1";
export const ADMIN_APPEARANCE_EVENT = "theouthaven:admin-appearance-change";

export const DEFAULT_ADMIN_APPEARANCE: AdminAppearanceSettings = {
  mode: "auto",
  lightStart: "07:00",
  darkStart: "19:00",
};

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeAdminAppearance(value: unknown): AdminAppearanceSettings {
  if (!value || typeof value !== "object") return DEFAULT_ADMIN_APPEARANCE;
  const raw = value as Partial<AdminAppearanceSettings>;
  const mode: AdminAppearanceMode = raw.mode === "light" || raw.mode === "dark" || raw.mode === "auto" ? raw.mode : "auto";
  return {
    mode,
    lightStart: isTime(raw.lightStart) ? raw.lightStart : DEFAULT_ADMIN_APPEARANCE.lightStart,
    darkStart: isTime(raw.darkStart) ? raw.darkStart : DEFAULT_ADMIN_APPEARANCE.darkStart,
  };
}

function minuteOfDay(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function resolveAdminTheme(settings: AdminAppearanceSettings, now = new Date()): AdminResolvedTheme {
  if (settings.mode === "light" || settings.mode === "dark") return settings.mode;
  const current = now.getHours() * 60 + now.getMinutes();
  const light = minuteOfDay(settings.lightStart);
  const dark = minuteOfDay(settings.darkStart);

  if (light === dark) return "light";
  if (light < dark) return current >= light && current < dark ? "light" : "dark";
  return current >= light || current < dark ? "light" : "dark";
}
