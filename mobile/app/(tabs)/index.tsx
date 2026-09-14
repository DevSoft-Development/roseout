import { useEffect, useRef, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { mobileApi } from "@/lib/api";
import { useAppTheme } from "@/providers/ThemeProvider";

const TYPEWRITER_PROMPTS = [
  "Dinner and something fun in Brooklyn tonight",
  "Sushi and karaoke near me",
  "Rooftop drinks and an activity in Manhattan",
  "Date night within walking distance",
  "Brunch and something to do afterward",
];

const QUICK_IDEAS = ["Date night", "Girls night", "Dinner + activity", "Birthday", "Tonight", "Near me"] as const;

const OCCASIONS = [
  ["Date Night", "Date night"],
  ["Girls’ Night", "Girls’ night"],
  ["Birthday", "Birthday"],
  ["Something Different", "Something different"],
] as const;

type PlannerIntentResponse = {
  ok: true;
  detectedLocation: { area: string; geoType: string; requestedMarket: string | null } | null;
};

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  const [openingPlanner, setOpeningPlanner] = useState(false);
  const searchRef = useRef<TextInput>(null);

  useEffect(() => {
    if (query || focused) return;

    let promptIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const current = TYPEWRITER_PROMPTS[promptIndex];
      if (!deleting) {
        characterIndex += 1;
        setTypedPlaceholder(current.slice(0, characterIndex));
        if (characterIndex >= current.length) {
          deleting = true;
          timer = setTimeout(tick, 1650);
          return;
        }
        timer = setTimeout(tick, 48);
        return;
      }

      characterIndex -= 1;
      setTypedPlaceholder(current.slice(0, Math.max(characterIndex, 0)));
      if (characterIndex <= 0) {
        deleting = false;
        promptIndex = (promptIndex + 1) % TYPEWRITER_PROMPTS.length;
        timer = setTimeout(tick, 320);
        return;
      }
      timer = setTimeout(tick, 24);
    };

    setTypedPlaceholder("");
    timer = setTimeout(tick, 420);
    return () => clearTimeout(timer);
  }, [focused, query]);

  const openPlanner = async (value = query, source = "homepage_outing_search", knownArea?: string) => {
    const prompt = value.trim();
    if (!prompt || openingPlanner) return;

    setOpeningPlanner(true);
    let detectedArea = knownArea?.trim() || "";

    if (!detectedArea) {
      try {
        const intent = await mobileApi<PlannerIntentResponse>("/search/intent", {
          method: "POST",
          body: JSON.stringify({ query: prompt }),
        });
        detectedArea = intent.detectedLocation?.area?.trim() || "";
      } catch {
        // Step 2 still lets the user enter a location if intent resolution cannot find one.
      }
    }

    router.push({
      pathname: "/(tabs)/plan",
      params: {
        prompt,
        planType: "outing",
        startAt: "2",
        source,
        area: detectedArea,
        areaSource: detectedArea ? "search" : "default",
      },
    });
    setOpeningPlanner(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View pointerEvents="none" style={styles.heroGlow} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: theme.spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <BrandHeader compact />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => router.push("/(tabs)/profile")}
            style={({ pressed }) => [
              styles.profileButton,
              { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface },
              pressed && { opacity: 0.72 },
            ]}
          >
            <AppText variant="bodyStrong">○</AppText>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <AppText variant="eyebrow" style={styles.pink}>NEW YORK CITY + LONG ISLAND</AppText>
          <View style={styles.heroTitleRow}>
            <AppText variant="display">Plan better </AppText>
            <AppText variant="display" accent>OUTings.</AppText>
          </View>
          <AppText muted style={styles.heroBody}>
            Tell us what you’re in the mood for. We’ll find the places and put the outing together.
          </AppText>

          <View style={[styles.searchShell, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceElevated }]}> 
            <View style={[styles.searchInputRow, { backgroundColor: theme.colors.background }]}> 
              <AppText style={styles.searchGlyph}>✦</AppText>
              <TextInput
                ref={searchRef}
                value={query}
                onChangeText={setQuery}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onSubmitEditing={() => void openPlanner()}
                placeholder={typedPlaceholder}
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="search"
                accessibilityLabel="Describe the outing you want"
                style={[styles.searchInput, { color: theme.colors.text }]}
              />
            </View>
            <Button onPress={() => void openPlanner()} disabled={!query.trim() || openingPlanner}>
              {openingPlanner ? "Understanding…" : "Find My Outing"}
            </Button>
          </View>

          <AppText muted style={styles.searchHint}>Try describing the whole night — not just a restaurant.</AppText>
          <View style={styles.quickIdeas}>
            {QUICK_IDEAS.map((idea) => (
              <Pressable
                key={idea}
                onPress={() => setQuery(idea)}
                style={({ pressed }) => [
                  styles.quickIdea,
                  { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface },
                  pressed && { opacity: 0.72 },
                ]}
              >
                <AppText variant="caption">{idea}</AppText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="eyebrow" style={styles.pink}>NEED INSPIRATION?</AppText>
          <AppText variant="h2" style={styles.sectionTitle}>Start with the kind of outing.</AppText>
          <View style={styles.occasionGrid}>
            {OCCASIONS.map(([label, prompt]) => (
              <Pressable
                key={label}
                onPress={() => void openPlanner(prompt, "homepage_occasion")}
                style={({ pressed }) => [
                  styles.occasionCard,
                  { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface },
                  pressed && { opacity: 0.72 },
                ]}
              >
                <AppText variant="bodyStrong">{label}</AppText>
                <AppText muted style={styles.cardArrow}>→</AppText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant="eyebrow" style={styles.pink}>HOW THEOUTHAVEN WORKS</AppText>
          <AppText variant="h2" style={styles.sectionTitle}>One search. Your whole outing.</AppText>

          <View style={styles.steps}>
            <Step number="01" title="Tell us what you want" text="Describe the night in your own words." />
            <Step number="02" title="We find what fits" text="We match places, distance, vibe, and timing." />
            <Step number="03" title="Pick your outing" text="Choose what feels right and keep the night moving." />
          </View>

          <View style={[styles.demo, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]}> 
            <View style={styles.demoStop}>
              <AppText variant="eyebrow" style={styles.pink}>DINNER</AppText>
              <AppText variant="h3" style={styles.demoTitle}>Italian</AppText>
              <AppText muted>Romantic · Manhattan</AppText>
            </View>
            <View style={[styles.demoConnector, { borderColor: theme.colors.border }]}> 
              <AppText variant="caption" muted>NEXT STOP</AppText>
              <AppText variant="bodyStrong" style={styles.pink}>8 min walk</AppText>
            </View>
            <View style={styles.demoStop}>
              <AppText variant="eyebrow" style={styles.pink}>ACTIVITY</AppText>
              <AppText variant="h3" style={styles.demoTitle}>Live music</AppText>
              <AppText muted>Jazz · Nearby</AppText>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <View style={styles.stepRow}>
      <AppText variant="eyebrow" style={styles.pink}>{number}</AppText>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText muted style={styles.stepText}>{text}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 118, gap: 34 },
  heroGlow: { position: "absolute", top: -120, left: -95, width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(225,6,42,0.12)" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  profileButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  hero: { paddingTop: 20, alignItems: "center" },
  heroTitleRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  heroBody: { marginTop: 14, fontSize: 16, lineHeight: 24, maxWidth: 360, textAlign: "center" },
  searchShell: { width: "100%", borderWidth: 1, borderRadius: 24, padding: 8, gap: 8, marginTop: 24 },
  searchInputRow: { minHeight: 58, borderRadius: 18, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  searchGlyph: { color: "#ff8a9b", marginRight: 10 },
  searchInput: { flex: 1, minHeight: 58, fontSize: 16, fontWeight: "600" },
  searchHint: { marginTop: 12, textAlign: "center", fontSize: 13 },
  quickIdeas: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  quickIdea: { minHeight: 38, borderWidth: 1, borderRadius: 19, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  section: { gap: 14 },
  sectionTitle: { marginTop: -4 },
  occasionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  occasionCard: { width: "48%", minHeight: 72, borderWidth: 1, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 13, justifyContent: "space-between" },
  cardArrow: { alignSelf: "flex-end", fontSize: 18 },
  steps: { gap: 10 },
  stepRow: { flexDirection: "row", gap: 14, paddingVertical: 8 },
  stepText: { marginTop: 3, lineHeight: 20 },
  demo: { borderWidth: 1, borderRadius: 22, overflow: "hidden", marginTop: 4 },
  demoStop: { padding: 18 },
  demoConnector: { borderTopWidth: 1, borderBottomWidth: 1, paddingHorizontal: 18, paddingVertical: 11, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  demoTitle: { marginTop: 4, marginBottom: 2 },
  pink: { color: "#ff8a9b" },
});
