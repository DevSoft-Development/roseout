import type { ColorSchemeName } from "react-native";

const brand = {
  red: "#E1062A",
  redHover: "#FF173D",
  redSoft: "rgba(225, 6, 42, 0.14)",
  redBorder: "rgba(225, 6, 42, 0.34)",
  pink: "#FF8A9B",
  black: "#050505",
  panel: "#0D0D0D",
  card: "#1A1A1A",
} as const;

const shared = {
  spacing: { xxs: 4, xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 },
  radius: { xs: 8, sm: 10, md: 16, lg: 24, xl: 30, pill: 999 },
  typography: {
    display: { fontSize: 38, lineHeight: 44, fontWeight: "900" as const, letterSpacing: -1.1 },
    h1: { fontSize: 32, lineHeight: 38, fontWeight: "900" as const, letterSpacing: -0.7 },
    h2: { fontSize: 24, lineHeight: 30, fontWeight: "900" as const, letterSpacing: -0.35 },
    h3: { fontSize: 20, lineHeight: 26, fontWeight: "800" as const },
    body: { fontSize: 17, lineHeight: 25, fontWeight: "400" as const },
    bodyStrong: { fontSize: 17, lineHeight: 25, fontWeight: "800" as const },
    label: { fontSize: 14, lineHeight: 20, fontWeight: "800" as const },
    caption: { fontSize: 12, lineHeight: 17, fontWeight: "600" as const },
    eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: "900" as const, letterSpacing: 1.4 },
  },
} as const;

const darkColors = {
  background: brand.black,
  surface: brand.panel,
  surfaceElevated: brand.card,
  surfaceMuted: "#090909",
  text: "#FFFFFF",
  textMuted: "rgba(255, 255, 255, 0.55)",
  textSubtle: "rgba(255, 255, 255, 0.40)",
  border: "rgba(255, 255, 255, 0.10)",
  borderStrong: "rgba(255, 255, 255, 0.16)",
  accent: brand.red,
  accentPressed: brand.redHover,
  accentSoft: brand.redSoft,
  accentBorder: brand.redBorder,
  accentAlt: brand.pink,
  onAccent: "#FFFFFF",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  overlay: "rgba(0, 0, 0, 0.72)",
  tabBar: brand.panel,
} as const;

// Kept for type compatibility with any future light-mode work. The consumer app
// intentionally uses the same dark brand system as TheOutHaven.com today.
const lightColors = darkColors;

export const darkTheme = { ...shared, mode: "dark" as const, colors: darkColors };
export const lightTheme = { ...shared, mode: "dark" as const, colors: lightColors };

export type AppTheme = typeof darkTheme;

export function getTheme(_colorScheme: ColorSchemeName): AppTheme {
  return darkTheme;
}

export const theme = darkTheme;
