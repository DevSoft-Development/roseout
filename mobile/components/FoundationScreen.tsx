import type { ReactNode } from "react";
import { SafeAreaView, ScrollView, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useAppTheme } from "@/providers/ThemeProvider";

type FoundationScreenProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function FoundationScreen({ eyebrow, title, description, children }: FoundationScreenProps) {
  const { theme } = useAppTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: 112 }}
      >
        {eyebrow ? <AppText variant="eyebrow" accent>{eyebrow}</AppText> : null}
        <AppText variant="h1" style={{ marginTop: eyebrow ? theme.spacing.sm : 0 }}>{title}</AppText>
        <AppText muted style={{ marginTop: theme.spacing.sm }}>{description}</AppText>
        {children ? <View style={{ marginTop: theme.spacing.xl }}>{children}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
