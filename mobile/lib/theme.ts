import type { ColorSchemeName } from "react-native";

const brand = {
  rose: "#E11D48",
  rosePressed: "#BE123C",
  roseSoftDark: "#3A1520",
  roseSoftLight: "#FFF1F2",
} as const;

const shared = {
  spacing: { xxs: 4, xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 },
  radius: { xs: 8, sm: 10, md: 16, lg: 24, xl: 30, pill: 999 },
  typography: {
    display: { fontSize: 38, lineHeight: 44, fontWeight: "800" as const, letterSpacing: -1.1 },
    h1: { fontSize: 32, lineHeight: 38, fontWeight: "800" as const, letterSpacing: -0.7 },
    h2: { fontSize: 24, lineHeight: 30, fontWeight: "800" as const, letterSpacing: -0.35 },
    h3: { fontSize: 20, lineHeight: 26, fontWeight: "700" as const },
    body: { fontSize: 17, lineHeight: 25, fontWeight: "400" as const },
    bodyStrong: { fontSize: 17, lineHeight: 25, fontWeight: "700" as const },
    label: { fontSize: 14, lineHeight: 20, fontWeight: "700" as const },
    caption: { fontSize: 12, lineHeight: 17, fontWeight: "600" as const },
    eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: "800" as const, letterSpacing: 1.4 },
  },
} as const;

const darkColors = {
  background: "#0B0B0F",
  surface: "#15151B",
  surfaceElevated: "#1D1D25",
  surfaceMuted: "#111116",
  text: "#FFFFFF",
  textMuted: "#A9A9B2",
  textSubtle: "#747480",
  border: "#2A2A34",
  borderStrong: "#3A3A46",
  accent: brand.rose,
  accentPressed: brand.rosePressed,
  accentSoft: brand.roseSoftDark,
  onAccent: "#FFFFFF",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  overlay: "rgba(0, 0, 0, 0.58)",
  tabBar: "#111116",
} as const;

const lightColors = {
  background: "#FFFDFD",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceMuted: "#F7F7F8",
  text: "#17171C",
  textMuted: "#63636F",
  textSubtle: "#8B8B95",
  border: "#E7E7EB",
  borderStrong: "#D3D3D9",
  accent: brand.rose,
  accentPressed: brand.rosePressed,
  accentSoft: brand.roseSoftLight,
  onAccent: "#FFFFFF",
  success: "#15803D",
  warning: "#B45309",
  danger: "#DC2626",
  overlay: "rgba(15, 15, 20, 0.34)",
  tabBar: "#FFFFFF",
} as const;

export const darkTheme = { ...shared, mode: "dark" as const, colors: darkColors };
export const lightTheme = { ...shared, mode: "light" as const, colors: lightColors };

export type AppTheme = typeof darkTheme | typeof lightTheme;

export function getTheme(colorScheme: ColorSchemeName): AppTheme {
  return colorScheme === "light" ? lightTheme : darkTheme;
}

export const theme = darkTheme;
