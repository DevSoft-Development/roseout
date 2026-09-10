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
          borderColor: elevated ? theme.colors.borderStrong : theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          shadowColor: "#000000",
          shadowOpacity: elevated ? 0.28 : 0.16,
          shadowRadius: elevated ? 28 : 16,
          shadowOffset: { width: 0, height: elevated ? 16 : 8 },
          elevation: elevated ? 8 : 3,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
