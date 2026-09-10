import type { ReactNode } from "react";
import { Pressable, SafeAreaView, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "@/components/ui/AppText";
import { useAppTheme } from "@/providers/ThemeProvider";

type FoundationScreenProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
  showHomeShortcut?: boolean;
};

export function FoundationScreen({ eyebrow, title, description, children, showHomeShortcut = true }: FoundationScreenProps) {
  const { theme } = useAppTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View pointerEvents="none" style={{ position: "absolute", top: -110, left: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: theme.colors.accentSoft, opacity: 0.62 }} />
      <View pointerEvents="none" style={{ position: "absolute", top: 80, right: -120, width: 250, height: 250, borderRadius: 125, backgroundColor: theme.colors.accentSoft, opacity: 0.34 }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {showHomeShortcut ? (
          <View style={{ alignItems: "flex-end", marginBottom: theme.spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Return to TheOutHaven home"
              hitSlop={10}
              onPress={() => router.replace("/")}
              style={({ pressed }) => ({
                minWidth: 46,
                height: 46,
                paddingHorizontal: 14,
                borderRadius: 23,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.borderStrong,
                opacity: pressed ? 0.82 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
                shadowColor: "#000000",
                shadowOpacity: 0.24,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 7 },
                elevation: 4,
              })}
            >
              <AppText variant="bodyStrong">⌂</AppText>
            </Pressable>
          </View>
        ) : null}
        {eyebrow ? <AppText variant="eyebrow" accent>{eyebrow}</AppText> : null}
        <AppText variant="h1" style={{ marginTop: eyebrow ? theme.spacing.sm : 0, maxWidth: 620 }}>{title}</AppText>
        <AppText muted style={{ marginTop: theme.spacing.sm, maxWidth: 620, lineHeight: 26 }}>{description}</AppText>
        {children ? <View style={{ marginTop: theme.spacing.xl }}>{children}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
