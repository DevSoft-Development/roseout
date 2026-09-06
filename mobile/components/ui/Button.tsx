import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useAppTheme } from "@/providers/ThemeProvider";

type Variant = "primary" | "secondary" | "ghost";

type Props = PressableProps & {
  children: ReactNode;
  variant?: Variant;
  fullWidth?: boolean;
};

export function Button({ children, variant = "primary", fullWidth = true, disabled, style, ...props }: Props) {
  const { theme } = useAppTheme();
  const backgroundColor = variant === "primary" ? theme.colors.accent : variant === "secondary" ? theme.colors.surfaceElevated : "transparent";
  const borderColor = variant === "primary" ? theme.colors.accent : variant === "secondary" ? theme.colors.borderStrong : "transparent";

  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={(state) => {
        const { pressed } = state;
        return [
          styles.base,
          {
            width: fullWidth ? "100%" : undefined,
            backgroundColor: pressed && variant === "primary" ? theme.colors.accentPressed : backgroundColor,
            borderColor,
            opacity: disabled ? 0.45 : pressed && variant !== "primary" ? 0.72 : 1,
          },
          typeof style === "function" ? style(state) : style,
        ];
      }}
    >
      <View style={styles.content}>
        <AppText variant="bodyStrong" style={{ color: variant === "primary" ? theme.colors.onAccent : theme.colors.text }}>
          {children}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 52, borderWidth: 1, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
});
