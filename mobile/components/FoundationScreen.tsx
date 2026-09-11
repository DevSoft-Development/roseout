import type { ReactNode } from "react";
import { Pressable, SafeAreaView, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { AppText } from "@/components/ui/AppText";
import { useAppTheme } from "@/providers/ThemeProvider";

type FoundationScreenProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
  beforeTitle?: ReactNode;
  showHomeShortcut?: boolean;
  showBrandHeader?: boolean;
  showBack?: boolean;
  backLabel?: string;
};

export function FoundationScreen({
  eyebrow,
  title,
  description,
  children,
  beforeTitle,
  showHomeShortcut = true,
  showBrandHeader = false,
  showBack = false,
  backLabel = "Back",
}: FoundationScreenProps) {
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
        {(showBrandHeader || showBack || showHomeShortcut) ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: theme.spacing.lg }}>
            <View style={{ minWidth: 74, alignItems: "flex-start" }}>
              {showBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={backLabel}
                  hitSlop={10}
                  onPress={() => router.back()}
                  style={({ pressed }) => ({
                    minHeight: 42,
                    paddingHorizontal: 12,
                    borderRadius: 21,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.borderStrong,
                    opacity: pressed ? 0.78 : 1,
                  })}
                >
                  <AppText variant="caption">← {backLabel}</AppText>
                </Pressable>
              ) : null}
            </View>

            {showBrandHeader ? <BrandHeader compact /> : <View style={{ flex: 1 }} />}

            <View style={{ minWidth: 74, alignItems: "flex-end" }}>
              {showHomeShortcut ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Return to TheOutHaven home"
                  hitSlop={10}
                  onPress={() => router.replace("/")}
                  style={({ pressed }) => ({
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.borderStrong,
                    opacity: pressed ? 0.82 : 1,
                  })}
                >
                  <AppText variant="bodyStrong">⌂</AppText>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {beforeTitle ? <View style={{ marginBottom: theme.spacing.lg }}>{beforeTitle}</View> : null}
        {eyebrow ? <AppText variant="eyebrow" accent>{eyebrow}</AppText> : null}
        <AppText variant="h1" style={{ marginTop: eyebrow ? theme.spacing.sm : 0, maxWidth: 620 }}>{title}</AppText>
        <AppText muted style={{ marginTop: theme.spacing.sm, maxWidth: 620, lineHeight: 26 }}>{description}</AppText>
        {children ? <View style={{ marginTop: theme.spacing.xl }}>{children}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}