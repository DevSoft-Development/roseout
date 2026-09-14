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
  stickyFooter?: ReactNode;
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
  stickyFooter,
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
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: stickyFooter ? 180 : 120,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {(showBrandHeader || showHomeShortcut) ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: showBack ? theme.spacing.md : theme.spacing.lg }}>
            {showBrandHeader ? <BrandHeader compact /> : <View style={{ flex: 1 }} />}

            {showHomeShortcut ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Return to TheOutHaven home"
                hitSlop={10}
                onPress={() => router.replace("/")}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.borderStrong,
                  opacity: pressed ? 0.82 : 1,
                  flexShrink: 0,
                })}
              >
                <AppText variant="bodyStrong">⌂</AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              minHeight: 40,
              paddingHorizontal: 13,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.borderStrong,
              opacity: pressed ? 0.78 : 1,
              marginBottom: theme.spacing.lg,
            })}
          >
            <AppText variant="caption">← {backLabel}</AppText>
          </Pressable>
        ) : null}

        {beforeTitle ? <View style={{ marginBottom: theme.spacing.lg }}>{beforeTitle}</View> : null}
        {eyebrow ? <AppText variant="eyebrow" accent>{eyebrow}</AppText> : null}
        <AppText variant="h1" style={{ marginTop: eyebrow ? theme.spacing.sm : 0, maxWidth: 620 }}>{title}</AppText>
        <AppText muted style={{ marginTop: theme.spacing.sm, maxWidth: 620, lineHeight: 26 }}>{description}</AppText>
        {children ? <View style={{ marginTop: theme.spacing.xl }}>{children}</View> : null}
      </ScrollView>

      {stickyFooter ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.sm,
            paddingBottom: theme.spacing.md,
            backgroundColor: theme.colors.background,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
          }}
        >
          {stickyFooter}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
