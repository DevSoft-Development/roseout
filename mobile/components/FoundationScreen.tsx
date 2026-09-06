import type { ReactNode } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";

type FoundationScreenProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function FoundationScreen({ eyebrow, title, description, children }: FoundationScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {children ? <View style={styles.body}>{children}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: 96 },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: theme.spacing.sm,
  },
  title: { color: theme.colors.text, fontSize: 34, fontWeight: "800" },
  description: {
    color: theme.colors.textMuted,
    fontSize: 17,
    lineHeight: 25,
    marginTop: theme.spacing.sm,
  },
  body: { marginTop: theme.spacing.xl },
});
