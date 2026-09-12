import { useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAppTheme } from "@/providers/ThemeProvider";

const EXAMPLES = [
  "Italian dinner and comedy show in Manhattan",
  "Date night in Brooklyn",
  "Seafood rooftop restaurant in Queens",
];

const EXPERIENCES = [
  ["Dinner worth leaving home for", "From neighborhood favorites to special-occasion tables."],
  ["Something to do next", "Comedy, karaoke, bowling, museums, games, nightlife, and more."],
  ["Plans that fit the moment", "Shape the outing around the occasion, area, timing, and mood."],
] as const;

const OCCASIONS = ["Date night", "Girls’ night", "Birthday", "Family outing", "Last-minute plans", "Group night out"];
const AREAS = ["Queens", "Brooklyn", "Manhattan", "Bronx", "Staten Island", "Long Island"];

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const [query, setQuery] = useState("");
  const searchRef = useRef<TextInput>(null);

  const openPlanner = (value = query) => {
    const prompt = value.trim();
    if (!prompt) return;
    router.push({
      pathname: "/(tabs)/plan",
      params: { prompt, planType: "outing", startAt: "2", source: "homepage_outing_search" },
    });
  };

  const openWeb = (path: string) => void Linking.openURL(`https://theouthaven.com${path}`);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View pointerEvents="none" style={styles.heroGlow} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: theme.spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BrandHeader />

        <View style={styles.hero}>
          <AppText variant="eyebrow" style={styles.pink}>NEW YORK CITY + LONG ISLAND</AppText>
          <View style={{ marginTop: 18 }}>
            <AppText variant="display">Plan the whole outing.</AppText>
            <AppText variant="display" accent>In one place.</AppText>
          </View>
          <AppText muted style={styles.heroBody}>
            TheOutHaven brings restaurants, activities, nightlife, and local experiences together around the kind of day or night you actually want.
          </AppText>

          <View style={styles.ctaStack}>
            <Button onPress={() => searchRef.current?.focus()}>Plan an Outing</Button>
            <Button variant="secondary" onPress={() => router.push("/(tabs)/explore")}>Explore Places</Button>
          </View>

          <View style={[styles.triptych, { borderColor: theme.colors.borderStrong }]}>
            <Stat label="Eat" detail="Restaurants & drinks" />
            <Stat label="Do" detail="Activities & nightlife" bordered />
            <Stat label="Go" detail="Neighborhoods & areas" bordered />
          </View>
        </View>

        <PremiumPreview />

        <View style={styles.searchSection}>
          <AppText variant="eyebrow" style={styles.pink}>START WITH WHAT SOUNDS GOOD</AppText>
          <AppText variant="h1" style={styles.center}>Tell us the outing you have in mind.</AppText>
          <AppText muted style={styles.centerBody}>
            Dinner and a show. Rooftop drinks. A birthday night in Queens. Say it your way and TheOutHaven will help bring the plan together.
          </AppText>

          <View style={[styles.searchShell, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]}> 
            <TextInput
              ref={searchRef}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => openPlanner()}
              placeholder="Italian dinner and comedy show in Manhattan"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="search"
              style={[styles.searchInput, { color: theme.colors.text, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.background }]}
            />
            <Button onPress={() => openPlanner()} disabled={!query.trim()}>Plan my outing</Button>
          </View>

          <View style={styles.chips}>
            {EXAMPLES.map((example) => (
              <Pressable
                key={example}
                onPress={() => setQuery(example)}
                style={({ pressed }) => [styles.chip, { borderColor: theme.colors.borderStrong }, pressed && { opacity: 0.72 }]}
              >
                <AppText variant="caption" muted>{example}</AppText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.experienceGrid}>
          {EXPERIENCES.map(([title, text], index) => (
            <Card key={title} elevated>
              <AppText variant="eyebrow" accent>{`0${index + 1}`}</AppText>
              <AppText variant="h2" style={{ marginTop: 10 }}>{title}</AppText>
              <AppText muted style={styles.cardBody}>{text}</AppText>
            </Card>
          ))}
        </View>

        <View style={styles.lightSection}>
          <AppText variant="eyebrow" accent>MADE FOR REAL PLANS</AppText>
          <AppText variant="h1" style={{ color: "#050505", marginTop: 10 }}>Less searching. More deciding.</AppText>
          <AppText style={styles.lightIntro}>
            TheOutHaven is built around the full outing, not a single stop. Start with the occasion, choose what fits, and keep the night moving without piecing everything together yourself.
          </AppText>
          <View style={{ gap: 12, marginTop: 20 }}>
            <LightFeature number="01" title="Say what you want" text="Dinner and comedy in Manhattan. A rooftop birthday in Queens. Brunch and something fun nearby." />
            <LightFeature number="02" title="See what fits together" text="Compare restaurants, activities, nightlife, and nearby options around the plan you described." />
            <LightFeature number="03" title="Make it yours" text="Choose the places that feel right, open their details, and build the outing around your people and your time." />
          </View>
        </View>

        <ChoiceSection eyebrow="CHOOSE THE OCCASION" title="Start with the reason you’re going out." items={OCCASIONS} onPick={openPlanner} />
        <ChoiceSection eyebrow="CHOOSE THE AREA" title="Find the right part of New York for the plan." items={AREAS} onPick={openPlanner} />

        <Card elevated>
          <AppText variant="eyebrow" style={styles.pink}>EXPLORE THEOUTHAVEN</AppText>
          <AppText variant="h1" style={{ marginTop: 10 }}>Find places worth building a plan around.</AppText>
          <AppText muted style={styles.cardBody}>
            Browse restaurants, activities, nightlife, and experiences across New York City and Long Island, then turn the places you like into a complete outing.
          </AppText>
          <View style={styles.ctaStack}>
            <Button onPress={() => router.push("/(tabs)/explore")}>Explore Places</Button>
            <Button variant="secondary" onPress={() => openWeb("/about")}>About TheOutHaven</Button>
          </View>
          <View style={[styles.possibilities, { borderColor: theme.colors.borderStrong }]}> 
            <AppText variant="eyebrow" style={styles.pink}>ONE CITY. COUNTLESS POSSIBILITIES.</AppText>
            {["Dinner that matches the mood", "An activity that keeps the night going", "A neighborhood that brings it all together"].map((item) => (
              <View key={item} style={[styles.possibilityRow, { borderColor: theme.colors.borderStrong }]}>
                <AppText variant="bodyStrong">{item}</AppText>
              </View>
            ))}
          </View>
        </Card>

        <View style={styles.businessSection}>
          <AppText variant="eyebrow" style={styles.pink}>FOR BUSINESSES</AppText>
          <AppText variant="h1" style={{ marginTop: 10 }}>Be part of where people decide to go next.</AppText>
          <AppText muted style={styles.cardBody}>
            Keep your presence accurate, show what makes your business worth choosing, and give people a clearer path from discovery to a night out.
          </AppText>
          <View style={{ marginTop: 18 }}>
            <Button onPress={() => openWeb("/business")}>For Businesses</Button>
          </View>
        </View>

        <View style={styles.footer}>
          <AppText variant="bodyStrong">TheOutHaven</AppText>
          <AppText variant="caption" muted>Plan better outings across NYC + Long Island.</AppText>
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ label, detail, bordered = false }: { label: string; detail: string; bordered?: boolean }) {
  return (
    <View style={[styles.stat, bordered && styles.statBorder]}>
      <AppText variant="bodyStrong">{label}</AppText>
      <AppText variant="caption" muted style={{ marginTop: 3 }}>{detail}</AppText>
    </View>
  );
}

function PremiumPreview() {
  const { theme } = useAppTheme();
  const items = [
    ["01", "Start with the table", "Dinner, brunch, drinks, or something special."],
    ["02", "Add the experience", "A show, activity, nightlife, or something unexpected."],
    ["03", "Keep it close", "Bring the stops together around the area that works."],
  ] as const;
  return (
    <Card elevated>
      <AppText variant="eyebrow" style={styles.pink}>YOUR NIGHT, CONSIDERED</AppText>
      <AppText variant="h2" style={{ marginTop: 8 }}>Build around the whole experience</AppText>
      <View style={{ gap: 10, marginTop: 18 }}>
        {items.map(([number, title, text]) => (
          <View key={number} style={[styles.previewRow, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]}> 
            <View style={[styles.numberCircle, { backgroundColor: theme.colors.accentSoft }]}>
              <AppText variant="caption" accent>{number}</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{title}</AppText>
              <AppText variant="caption" muted style={{ marginTop: 3, lineHeight: 20 }}>{text}</AppText>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

function LightFeature({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <View style={styles.lightCard}>
      <AppText variant="eyebrow" style={{ color: "#e1062a" }}>{number}</AppText>
      <AppText variant="h2" style={{ color: "#050505", marginTop: 9 }}>{title}</AppText>
      <AppText style={styles.lightBody}>{text}</AppText>
    </View>
  );
}

function ChoiceSection({ eyebrow, title, items, onPick }: { eyebrow: string; title: string; items: string[]; onPick: (value: string) => void }) {
  const { theme } = useAppTheme();
  return (
    <Card elevated>
      <AppText variant="eyebrow" style={styles.pink}>{eyebrow}</AppText>
      <AppText variant="h2" style={{ marginTop: 9 }}>{title}</AppText>
      <View style={styles.chips}>
        {items.map((item) => (
          <Pressable key={item} onPress={() => onPick(item)} style={({ pressed }) => [styles.choiceChip, { borderColor: theme.colors.borderStrong }, pressed && { opacity: 0.72 }]}> 
            <AppText variant="caption">{item}</AppText>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 22, paddingBottom: 118, gap: 22 },
  heroGlow: { position: "absolute", top: -120, left: -100, width: 360, height: 360, borderRadius: 180, backgroundColor: "rgba(225,6,42,0.16)" },
  hero: { paddingTop: 10 },
  pink: { color: "#ff8a9b" },
  heroBody: { marginTop: 18, fontSize: 17, lineHeight: 28 },
  ctaStack: { gap: 10, marginTop: 22 },
  triptych: { marginTop: 24, borderTopWidth: 1, borderBottomWidth: 1, flexDirection: "row", paddingVertical: 16 },
  stat: { flex: 1, paddingHorizontal: 8 },
  statBorder: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.10)" },
  searchSection: { paddingVertical: 10 },
  center: { textAlign: "center", marginTop: 9 },
  centerBody: { textAlign: "center", marginTop: 12, lineHeight: 24 },
  searchShell: { borderWidth: 1, borderRadius: 26, padding: 8, gap: 8, marginTop: 20 },
  searchInput: { minHeight: 58, borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, fontSize: 16, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  choiceChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  experienceGrid: { gap: 12 },
  cardBody: { marginTop: 10, lineHeight: 24 },
  previewRow: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 18, padding: 14 },
  numberCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  lightSection: { backgroundColor: "#ffffff", marginHorizontal: -22, paddingHorizontal: 22, paddingVertical: 28 },
  lightIntro: { color: "rgba(5,5,5,0.62)", marginTop: 12, lineHeight: 25 },
  lightCard: { borderRadius: 22, borderWidth: 1, borderColor: "rgba(5,5,5,0.10)", backgroundColor: "#f7f7f7", padding: 20 },
  lightBody: { color: "rgba(5,5,5,0.62)", marginTop: 9, lineHeight: 23 },
  possibilities: { marginTop: 20, borderTopWidth: 1, paddingTop: 18 },
  possibilityRow: { borderBottomWidth: 1, paddingVertical: 14 },
  businessSection: { marginHorizontal: -22, paddingHorizontal: 22, paddingVertical: 28, backgroundColor: "#120606" },
  footer: { paddingVertical: 8, gap: 4 },
});
