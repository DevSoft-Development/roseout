import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { getTheme, type AppTheme } from "@/lib/theme";

type ThemeContextValue = {
  theme: AppTheme;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const value = useMemo(() => {
    const theme = getTheme(colorScheme);
    return { theme, isDark: theme.mode === "dark" };
  }, [colorScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useAppTheme must be used within ThemeProvider");
  return value;
}
