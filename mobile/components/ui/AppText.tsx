import type { ReactNode } from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import { useAppTheme } from "@/providers/ThemeProvider";

type Variant = "display" | "h1" | "h2" | "h3" | "body" | "bodyStrong" | "label" | "caption" | "eyebrow";

type Props = TextProps & {
  children: ReactNode;
  variant?: Variant;
  muted?: boolean;
  accent?: boolean;
};

export function AppText({ children, variant = "body", muted, accent, style, ...props }: Props) {
  const { theme } = useAppTheme();
  const color = accent ? theme.colors.accent : muted ? theme.colors.textMuted : theme.colors.text;
  return <Text {...props} style={[theme.typography[variant] as TextStyle, { color }, style]}>{children}</Text>;
}
