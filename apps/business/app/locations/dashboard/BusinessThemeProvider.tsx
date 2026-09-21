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
      <div className={`business-dashboard-theme business-theme-${theme} min-h-screen`}>
        {children}
      </div>
    </BusinessThemeContext.Provider>
  );
}
