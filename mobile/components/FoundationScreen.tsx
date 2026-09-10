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
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 112 }}
      >
        {showHomeShortcut ? (
          <View style={{ alignItems: "flex-end", marginBottom: theme.spacing.sm }}>
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
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.borderStrong,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <AppText variant="h3">⌂</AppText>
            </Pressable>
          </View>
        ) : null}
        {eyebrow ? <AppText variant="eyebrow" accent>{eyebrow}</AppText> : null}
        <AppText variant="h1" style={{ marginTop: eyebrow ? theme.spacing.sm : 0 }}>{title}</AppText>
        <AppText muted style={{ marginTop: theme.spacing.sm }}>{description}</AppText>
        {children ? <View style={{ marginTop: theme.spacing.xl }}>{children}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
