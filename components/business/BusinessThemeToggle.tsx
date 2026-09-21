"use client";

import { Moon, Sun } from "lucide-react";
import { useBusinessTheme } from "@/app/locations/dashboard/BusinessThemeProvider";

export default function BusinessThemeToggle() {
  const { theme, toggleTheme } = useBusinessTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to daytime mode" : "Switch to nighttime mode"}
      className="fixed bottom-4 right-4 z-[90] inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--business-border)] bg-[var(--business-panel)] px-4 py-2 text-xs font-black text-[var(--business-text)] shadow-xl shadow-black/15 backdrop-blur-xl transition hover:border-[#ff2142]/35"
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      <span>{theme === "dark" ? "Daytime" : "Nighttime"}</span>
    </button>
  );
}
