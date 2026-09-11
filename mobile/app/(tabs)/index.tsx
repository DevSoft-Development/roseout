import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import type { MobilePlanType } from "@/lib/search-draft";
import { useAppTheme } from "@/providers/ThemeProvider";

const QUICK_INTENTS = ["Date Night", "Girls Night", "Dinner + Activity", "Drinks", "Brunch", "Live Music"];
const PLAN_TYPES: Array<{ id: MobilePlanType; label: string; icon: string }> = [
  { id: "outing", label: "Outing", icon: "✦" },
  { id: "restaurant", label: "Restaurant", icon: "●" },
  { id: "activity", label: "Activity", icon: "◇" },
];
const OCCASIONS = [
  { title: "Date Night", description: "Dinner, drinks, activities, and somewhere worth staying out for." },
  { title: "Birthday", description: "Build a complete celebration around food and something fun." },
  { title: "Family Day", description: "Find an easy restaurant + activity combination for the whole group." },
];

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const [query, setQuery] = useState("");
  const [planType, setPlanType] = useState<MobilePlanType>("outing");

  const startPlan = (prompt: string, type: MobilePlanType = planType) => {
    router.push({ pathname: "/(tabs)/plan", params: { prompt, planType: type, startAt: "2" } });
  };

  const submit = () => {
    const prompt = query.trim();
    startPlan(prompt || "Plan an outing near me");
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View pointerEvents="none" style={{ position: "absolute", top: -100, left: -90, width: 300, height: 300, borderRadius: 150, backgroundColor: theme.colors.accentSoft, opacity: 0.68 }} />
      <View pointerEvents="none" style={{ position: "absolute", top: 180, right: -140, width: 280, height: 280, borderRadius: 140, backgroundColor: theme.colors.accentSoft, opacity: 0.3 }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: theme.spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BrandHeader />

        <View style={styles.hero}>
          <AppText variant="eyebrow" accent>NEW YORK CITY + LONG ISLAND</AppText>
          <View style={{ gap: 2 }}>
            <AppText variant="display">Plan the whole outing.</AppText>
            <AppText variant="display" accent>In one place.</AppText>
          </View>
          <AppText muted style={{ lineHeight: 27 }}>
            Restaurants, activities, nightlife, and local experiences matched around the kind of day or night you actually want.
          </AppText>

          <View style={[styles.planPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong }]}>
            <AppText variant="eyebrow" accent>WHAT ARE YOU PLANNING?</AppText>
            <View style={styles.typeRow}>
              {PLAN_TYPES.map((item) => (
                <Chip
                  key={item.id}
                  label={`${item.icon} ${item.label}`}
                  selected={planType === item.id}
                  onPress={() => setPlanType(item.id)}
                />
              ))}
            </View>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Steak dinner and rooftop drinks in Manhattan"
              returnKeyType="search"
              onSubmitEditing={submit}
            />
            <Button onPress={submit}>Make it yours →</Button>
          </View>

          <View style={[styles.promiseRow, { borderTopColor: theme.colors.border, borderBottomColor: theme.colors.border }]}>
            {[['Eat', 'Restaurants & drinks'], ['Do', 'Activities & nightlife'], ['Go', 'Neighborhoods & areas']].map(([title, subtitle], index) => (
              <View key={title} style={[styles.promiseItem, index ? { borderLeftWidth: 1, borderLeftColor: theme.colors.border } : null]}>
                <AppText variant="bodyStrong">{title}</AppText>
                <AppText variant="caption" muted>{subtitle}</AppText>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <AppText variant="eyebrow" accent>START QUICKLY</AppText>
            <AppText variant="h2">Tell us the vibe.</AppText>
            <AppText variant="caption" muted>Popular ways people plan with TheOutHaven.</AppText>
          </View>
          <View style={styles.chips}>
            {QUICK_INTENTS.map((intent) => <Chip key={intent} label={intent} onPress={() => startPlan(intent)} />)}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <AppText variant="eyebrow" accent>PLAN BY OCCASION</AppText>
            <AppText variant="h2">Start with why you’re going out.</AppText>
          </View>
          <View style={styles.cards}>
            {OCCASIONS.map((occasion) => (
              <DiscoveryCard key={occasion.title} eyebrow="OCCASION" title={occasion.title} description={occasion.description} onPress={() => startPlan(occasion.title)} />
            ))}
          </View>
        </View>

        <Pressable onPress={() => router.push("/(tabs)/explore")} style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] }]}>
          <View style={[styles.exploreBanner, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceElevated }]}>
            <AppText variant="eyebrow" accent>EXPLORE THEOUTHAVEN</AppText>
            <AppText variant="h2" style={{ marginTop: 8 }}>Find places worth building a plan around.</AppText>
            <AppText muted style={{ marginTop: 8, lineHeight: 24 }}>Browse restaurants, activities, nightlife, and experiences — then turn the places you like into a complete OUTing.</AppText>
            <AppText variant="bodyStrong" accent style={{ marginTop: 18 }}>Explore places →</AppText>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 22, paddingBottom: 44, gap: 34 },
  hero: { gap: 18, paddingTop: 8 },
  planPanel: { borderWidth: 1, borderRadius: 28, padding: 16, gap: 14, shadowColor: "#000000", shadowOpacity: 0.28, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 6 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  promiseRow: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 16 },
  promiseItem: { flex: 1, gap: 4, paddingHorizontal: 10 },
  section: { gap: 14 },
  sectionHeading: { gap: 5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cards: { gap: 12 },
  exploreBanner: { borderWidth: 1, borderRadius: 28, padding: 22, overflow: "hidden" },
});
