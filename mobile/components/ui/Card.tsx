import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { useAppTheme } from "@/providers/ThemeProvider";

type Props = ViewProps & { children: ReactNode; elevated?: boolean };

export function Card({ children, elevated, style, ...props }: Props) {
  const { theme } = useAppTheme();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: elevated ? theme.colors.surfaceElevated : theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          shadowColor: "#000000",
          shadowOpacity: elevated && theme.mode === "light" ? 0.08 : 0,
          shadowRadius: elevated ? 18 : 0,
          shadowOffset: { width: 0, height: 8 },
          elevation: elevated ? 2 : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
