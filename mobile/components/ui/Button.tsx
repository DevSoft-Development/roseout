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
            opacity: disabled ? 0.42 : 1,
            transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
            shadowColor: variant === "primary" ? theme.colors.accent : "#000000",
            shadowOpacity: variant === "primary" && !disabled ? 0.28 : 0,
            shadowRadius: variant === "primary" ? 18 : 0,
            shadowOffset: { width: 0, height: 8 },
            elevation: variant === "primary" && !disabled ? 4 : 0,
          },
          typeof style === "function" ? style(state) : style,
        ];
      }}
    >
      <View style={styles.content}>
        <AppText variant="bodyStrong" style={{ color: variant === "primary" ? theme.colors.onAccent : theme.colors.text, fontWeight: "900" }}>
          {children}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 54, borderWidth: 1, borderRadius: 999, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 22, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
});
