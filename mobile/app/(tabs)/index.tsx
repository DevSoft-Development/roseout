import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { JourneySteps } from "@/components/planner/JourneySteps";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import type { MobilePlanType } from "@/lib/search-draft";
import { useAppTheme } from "@/providers/ThemeProvider";

const PLAN_TYPES: Array<{ id: MobilePlanType; label: string; mobileLabel: string; description: string; icon: string }> = [
  { id: "outing", label: "Restaurant + Activity", mobileLabel: "Outing", description: "A complete outing with food, drinks, and something to do.", icon: "✨" },
  { id: "restaurant", label: "Restaurant", mobileLabel: "Restaurant", description: "The right place to eat, brunch, or grab drinks.", icon: "🍽️" },
  { id: "activity", label: "Activity", mobileLabel: "Activity", description: "Something fun to do on its own.", icon: "🎳" },
];

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const [query, setQuery] = useState("");
  const [planType, setPlanType] = useState<MobilePlanType>("outing");
  const selectedPlanType = PLAN_TYPES.find((item) => item.id === planType) || PLAN_TYPES[0];

  const submit = () => {
    const prompt = query.trim();
    if (!prompt) return;
    router.push({ pathname: "/(tabs)/plan", params: { prompt, planType, startAt: "2" } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View pointerEvents="none" style={{ position: "absolute", top: -100, left: -90, width: 300, height: 300, borderRadius: 150, backgroundColor: theme.colors.accentSoft, opacity: 0.68 }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: theme.spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BrandHeader />
        <JourneySteps activeStep={1} />

        <View style={styles.heading}>
          <AppText variant="display">What are you</AppText>
          <AppText variant="display" accent>planning?</AppText>
        </View>

        <Card elevated>
          <AppText variant="eyebrow" accent>CHOOSE YOUR PLAN TYPE</AppText>
          <View style={styles.typeRow}>
            {PLAN_TYPES.map((item) => (
              <Chip
                key={item.id}
                label={`${item.icon} ${item.mobileLabel}`}
                selected={planType === item.id}
                onPress={() => setPlanType(item.id)}
              />
            ))}
          </View>
          <AppText muted style={{ marginTop: 10, lineHeight: 22 }}>{selectedPlanType.description}</AppText>

          <View style={{ marginTop: theme.spacing.lg }}>
            <AppText variant="caption">Search naturally</AppText>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Steak dinner and rooftop drinks in Manhattan"
              returnKeyType="search"
              onSubmitEditing={submit}
              style={{ marginTop: theme.spacing.sm }}
            />
          </View>

          <View style={{ marginTop: theme.spacing.md }}>
            <Button onPress={submit} disabled={!query.trim()}>Continue →</Button>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 22, paddingBottom: 118, gap: 22 },
  heading: { gap: 0, paddingTop: 4 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
});