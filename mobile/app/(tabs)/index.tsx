import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import { useAppTheme } from "@/providers/ThemeProvider";

const QUICK_INTENTS = [
  "Date Night",
  "Girls Night",
  "Dinner + Activity",
  "Drinks",
  "Brunch",
  "Live Music",
];

const OCCASIONS = [
  { title: "Date Night", description: "Dinner, drinks, activities, and somewhere worth staying out for." },
  { title: "Birthday", description: "Build a complete celebration around food and something fun." },
  { title: "Family Day", description: "Find an easy restaurant + activity combination for the whole group." },
];

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const [query, setQuery] = useState("");

  const startPlan = (prompt: string) => {
    router.push({ pathname: "/plan", params: { prompt } });
  };

  const submit = () => {
    const prompt = query.trim();
    startPlan(prompt || "Plan an outing near me");
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { paddingHorizontal: theme.spacing.lg }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <AppText variant="eyebrow" accent>THEOUTHAVEN</AppText>
        <AppText variant="display">What are we doing?</AppText>
        <AppText muted>
          Tell us the vibe. We’ll turn it into a complete OUTing instead of making you search place by place.
        </AppText>

        <View style={styles.searchBlock}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Dinner and something fun in Brooklyn"
            returnKeyType="search"
            onSubmitEditing={submit}
          />
          <Button onPress={submit}>Plan an OUTing</Button>
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="h2">Start quickly</AppText>
        <View style={styles.chips}>
          {QUICK_INTENTS.map((intent) => (
            <Chip key={intent} label={intent} onPress={() => startPlan(intent)} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="h2">Plan something</AppText>
        <View style={styles.row}>
          <Chip label="Tonight" onPress={() => startPlan("Plan something for tonight near me")} />
          <Chip label="This weekend" onPress={() => startPlan("Plan something for this weekend near me")} />
          <Chip label="Near me" onPress={() => startPlan("Plan an outing near me")} />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <AppText variant="h2">Plan by occasion</AppText>
          <AppText variant="caption" muted>Discovery built around the outing, not a directory.</AppText>
        </View>
        <View style={styles.cards}>
          {OCCASIONS.map((occasion) => (
            <DiscoveryCard
              key={occasion.title}
              eyebrow="OCCASION"
              title={occasion.title}
              description={occasion.description}
              onPress={() => startPlan(occasion.title)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="h2">Explore your way</AppText>
        <DiscoveryCard
          eyebrow="DISCOVER"
          title="Popular near you"
          description="Restaurants, activities, and complete outing ideas around your current area."
          onPress={() => router.push("/explore")}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 64,
    paddingBottom: 48,
    gap: 34,
  },
  hero: {
    gap: 12,
  },
  searchBlock: {
    gap: 12,
    marginTop: 10,
  },
  section: {
    gap: 14,
  },
  sectionHeading: {
    gap: 4,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cards: {
    gap: 12,
  },
});
