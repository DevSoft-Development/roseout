"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type BusinessTheme = "dark" | "light";

type BusinessThemeContextValue = {
  theme: BusinessTheme;
  setTheme: (theme: BusinessTheme) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "theouthaven_business_theme";
const BusinessThemeContext = createContext<BusinessThemeContextValue | null>(null);

function initialTheme(): BusinessTheme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useBusinessTheme() {
  const context = useContext(BusinessThemeContext);
  if (!context) throw new Error("useBusinessTheme must be used within BusinessThemeProvider");
  return context;
}

export default function BusinessThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<BusinessTheme>("dark");

  useEffect(() => {
    setThemeState(initialTheme());
  }, []);

  function setTheme(next: BusinessTheme) {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark") }),
    [theme],
  );

  return (
    <BusinessThemeContext.Provider value={value}>
      <div className={`business-dashboard-theme business-theme-${theme} min-h-screen bg-[var(--business-bg)] text-[var(--business-text)]`}>
        {children}
        <style>{`
          .business-dashboard-theme {
            --business-bg: #050607;
            --business-panel: #0b0d11;
            --business-panel-strong: #11141a;
            --business-border: rgba(255,255,255,.10);
            --business-text: #ffffff;
            --business-soft: rgba(255,255,255,.72);
            --business-muted: rgba(255,255,255,.58);
            --business-muted-strong: rgba(255,255,255,.78);
            --business-sidebar: #06080b;
            background: var(--business-bg);
            color: var(--business-text);
            color-scheme: dark;
          }

          .business-dashboard-theme.business-theme-light {
            --business-bg: #f6f3f0;
            --business-panel: #ffffff;
            --business-panel-strong: #f1ebe7;
            --business-border: rgba(60,38,32,.16);
            --business-text: #211714;
            --business-soft: rgba(57,41,36,.78);
            --business-muted: rgba(57,41,36,.62);
            --business-muted-strong: rgba(57,41,36,.82);
            --business-sidebar: #fffdfb;
            color-scheme: light;
          }

          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-[#0"],
          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-[#1"],
          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-[#2"],
          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-black"],
          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-neutral-9"],
          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-zinc-9"],
          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-slate-9"] {
            background-color: var(--business-panel) !important;
          }

          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-gradient"][class*="from-[#0"],
          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-gradient"][class*="from-[#1"],
          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-gradient"][class*="to-[#0"],
          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-gradient"][class*="to-[#1"],
          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-[radial-gradient"] {
            background-image: none !important;
            background-color: var(--business-panel) !important;
          }

          .business-theme-light :is(input,select,textarea)[class*="bg-[#0"],
          .business-theme-light :is(input,select,textarea)[class*="bg-[#1"],
          .business-theme-light :is(input,select,textarea)[class*="bg-black"] {
            background-color: var(--business-panel-strong) !important;
            color: var(--business-text) !important;
          }

          .business-theme-light [class*="border-white/"] {
            border-color: var(--business-border) !important;
          }

          .business-theme-light [class*="text-white/"] {
            color: var(--business-muted) !important;
          }

          .business-theme-light [class~="text-white"] {
            color: var(--business-text) !important;
          }

          .business-theme-light [class*="placeholder:text-white"]::placeholder {
            color: var(--business-muted) !important;
          }

          .business-theme-light :is(main,section,article,aside,header,div)[class*="bg-white/"] {
            background-color: var(--business-panel-strong) !important;
          }

          .business-theme-dark :is(main,section,article,aside,header,div)[class*="bg-neutral-50"],
          .business-theme-dark :is(main,section,article,aside,header,div)[class*="bg-gray-50"],
          .business-theme-dark :is(main,section,article,aside,header,div)[class*="bg-slate-50"],
          .business-theme-dark :is(main,section,article,aside,header,div)[class*="bg-[#fff"],
          .business-theme-dark :is(main,section,article,aside,header,div)[class~="bg-white"] {
            background-color: var(--business-panel) !important;
          }

          .business-theme-dark :is(input,select,textarea)[class~="bg-white"],
          .business-theme-dark :is(input,select,textarea)[class*="bg-neutral-50"],
          .business-theme-dark :is(input,select,textarea)[class*="bg-gray-50"] {
            background-color: var(--business-panel-strong) !important;
            color: var(--business-text) !important;
          }

          .business-theme-dark [class*="border-black/"] {
            border-color: var(--business-border) !important;
          }

          .business-theme-dark [class*="text-black/"] {
            color: var(--business-muted) !important;
          }

          .business-dashboard-theme select,
          .business-dashboard-theme option {
            color-scheme: inherit;
          }
        `}</style>
      </div>
    </BusinessThemeContext.Provider>
  );
}
