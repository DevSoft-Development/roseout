import { useEffect, useRef, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { mobileApi } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme } from "@/providers/ThemeProvider";

const TYPEWRITER_PROMPTS = [
  "Date night in Brooklyn",
  "Italian dinner and comedy in Manhattan",
  "Rooftop drinks in Queens",
  "Brunch and something fun on Long Island",
];

const OCCASIONS = [
  ["Date Night", "Date night"],
  ["Girls’ Night", "Girls’ night"],
  ["Birthday", "Birthday"],
  ["Family", "Family outing"],
] as const;

const AREAS = ["Manhattan", "Brooklyn", "Queens", "Long Island"] as const;

type UpcomingOuting = {
  id: string;
  title: string;
  status?: string;
  outingDate?: string | null;
  restaurant?: { name: string } | null;
  activity?: { name: string } | null;
};

type OutingsPayload = { ok: true; upcoming: UpcomingOuting[] };
type PlannerIntentResponse = {
  ok: true;
  detectedLocation: { area: string; geoType: string; requestedMarket: string | null } | null;
};

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  const [nextOuting, setNextOuting] = useState<UpcomingOuting | null>(null);
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
          timer = setTimeout(tick, 1400);
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
        timer = setTimeout(tick, 300);
        return;
      }
      timer = setTimeout(tick, 26);
    };

    setTypedPlaceholder("");
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [focused, query]);

  useEffect(() => {
    let active = true;
    if (!user) {
      setNextOuting(null);
      return () => { active = false; };
    }

    void mobileApi<OutingsPayload>("/outings")
      .then((payload) => {
        if (active) setNextOuting(payload.upcoming?.[0] || null);
      })
      .catch(() => {
        if (active) setNextOuting(null);
      });

    return () => { active = false; };
  }, [user?.id]);

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
        // Location can still be entered on Step 2 if the lightweight parser cannot resolve it.
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
          <AppText variant="display">Plan the whole outing.</AppText>
          <AppText muted style={styles.heroBody}>
            Tell us what you’re in the mood for and we’ll bring the plan together.
          </AppText>

          <View style={[styles.searchShell, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceElevated }]}> 
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
              style={[styles.searchInput, { color: theme.colors.text, backgroundColor: theme.colors.background }]}
            />
            <Button onPress={() => void openPlanner()} disabled={!query.trim() || openingPlanner}>{openingPlanner ? "Reading your plan…" : "Plan my outing"}</Button>
          </View>
        </View>

        <SectionHeader title="What’s the occasion?" />
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
            </Pressable>
          ))}
        </View>

        <SectionHeader title="Popular areas" action="Explore all" onAction={() => router.push("/(tabs)/explore")} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRail}>
          {AREAS.map((area) => (
            <Pressable
              key={area}
              onPress={() => void openPlanner(area, "homepage_area", area)}
              style={({ pressed }) => [
                styles.areaPill,
                { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceElevated },
                pressed && { opacity: 0.72 },
              ]}
            >
              <AppText variant="bodyStrong">{area}</AppText>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          onPress={() => void openPlanner("Dinner and something fun nearby", "homepage_inspiration")}
          style={({ pressed }) => [styles.inspirationCta, pressed && { opacity: 0.8 }]}
        >
          <AppText variant="eyebrow" style={styles.pink}>NEED AN IDEA?</AppText>
          <AppText variant="h3" style={{ marginTop: 6 }}>Build me a night out</AppText>
          <AppText muted style={{ marginTop: 5 }}>We’ll start with a strong dinner + activity plan and you can make it yours.</AppText>
        </Pressable>

        {nextOuting ? (
          <View>
            <SectionHeader title="Your next OUTing" action="All outings" onAction={() => router.push("/(tabs)/outings")} />
            <Card elevated>
              <AppText variant="eyebrow" accent>UPCOMING</AppText>
              <AppText variant="h2" style={{ marginTop: 8 }}>{nextOuting.title || "Your OUTing"}</AppText>
              {nextOuting.outingDate ? (
                <AppText muted style={{ marginTop: 7 }}>{new Date(nextOuting.outingDate).toLocaleString()}</AppText>
              ) : null}
              {nextOuting.restaurant?.name ? <AppText muted style={{ marginTop: 8 }}>Dinner · {nextOuting.restaurant.name}</AppText> : null}
              {nextOuting.activity?.name ? <AppText muted>Then · {nextOuting.activity.name}</AppText> : null}
              <View style={{ marginTop: 16 }}>
                <Button onPress={() => router.push({ pathname: "/outing/[id]/active", params: { id: nextOuting.id } })}>
                  {nextOuting.status === "active" ? "Continue OUTing" : "View OUTing"}
                </Button>
              </View>
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="h3">{title}</AppText>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <AppText variant="caption" accent>{action}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 118, gap: 18 },
  heroGlow: { position: "absolute", top: -120, left: -95, width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(225,6,42,0.10)" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  profileButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  hero: { paddingTop: 8 },
  heroBody: { marginTop: 8, fontSize: 15, lineHeight: 22, maxWidth: 340 },
  searchShell: { borderWidth: 1, borderRadius: 22, padding: 7, gap: 7, marginTop: 16 },
  searchInput: { minHeight: 54, borderRadius: 17, paddingHorizontal: 15, fontSize: 16, fontWeight: "600" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 2 },
  occasionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  occasionCard: { width: "48%", minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, justifyContent: "center" },
  horizontalRail: { gap: 9, paddingRight: 6 },
  areaPill: { minHeight: 48, borderWidth: 1, borderRadius: 24, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  inspirationCta: { borderRadius: 20, padding: 17, backgroundColor: "#120606" },
  pink: { color: "#ff8a9b" },
});
