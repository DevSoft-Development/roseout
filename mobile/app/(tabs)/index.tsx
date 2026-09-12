import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
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
  ["Group Night", "Group night out"],
  ["Last-Minute", "Last-minute plans"],
] as const;

const AREAS = ["Manhattan", "Brooklyn", "Queens", "Long Island"] as const;
const INSPIRATION = [
  ["Dinner + something fun", "Dinner and something fun nearby"],
  ["Rooftop night", "Rooftop drinks and something fun"],
  ["Brunch + activity", "Brunch and an activity"],
] as const;

type UpcomingOuting = {
  id: string;
  title: string;
  status?: string;
  outingDate?: string | null;
  restaurant?: { name: string } | null;
  activity?: { name: string } | null;
};

type OutingsPayload = { ok: true; upcoming: UpcomingOuting[] };

export default function HomeScreen() {
  const { theme } = useAppTheme();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  const [nextOuting, setNextOuting] = useState<UpcomingOuting | null>(null);
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

  const openPlanner = (value = query, source = "homepage_outing_search") => {
    const prompt = value.trim();
    if (!prompt) return;
    router.push({
      pathname: "/(tabs)/plan",
      params: { prompt, planType: "outing", startAt: "2", source },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
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
              onSubmitEditing={() => openPlanner()}
              placeholder={typedPlaceholder}
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="search"
              style={[styles.searchInput, { color: theme.colors.text, backgroundColor: theme.colors.background }]}
            />
            <Button onPress={() => openPlanner()} disabled={!query.trim()}>Plan my outing</Button>
          </View>
        </View>

        <SectionHeader title="What’s the occasion?" />
        <View style={styles.occasionGrid}>
          {OCCASIONS.map(([label, prompt]) => (
            <Pressable
              key={label}
              onPress={() => openPlanner(prompt, "homepage_occasion")}
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
              onPress={() => openPlanner(area, "homepage_area")}
              style={({ pressed }) => [
                styles.areaCard,
                { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceElevated },
                pressed && { opacity: 0.72 },
              ]}
            >
              <AppText variant="eyebrow" accent>PLAN HERE</AppText>
              <AppText variant="h3" style={{ marginTop: 8 }}>{area}</AppText>
            </Pressable>
          ))}
        </ScrollView>

        <SectionHeader title="Need inspiration?" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRail}>
          {INSPIRATION.map(([title, prompt]) => (
            <Pressable
              key={title}
              onPress={() => openPlanner(prompt, "homepage_inspiration")}
              style={({ pressed }) => [
                styles.inspirationCard,
                { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface },
                pressed && { opacity: 0.72 },
              ]}
            >
              <View style={styles.inspirationGlow} />
              <AppText variant="eyebrow" style={styles.pink}>PLAN THIS VIBE</AppText>
              <AppText variant="h3" style={{ marginTop: 10 }}>{title}</AppText>
              <AppText variant="caption" muted style={{ marginTop: 7 }}>Tap to make it yours →</AppText>
            </Pressable>
          ))}
        </ScrollView>

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

        <Pressable
          onPress={() => searchRef.current?.focus()}
          style={({ pressed }) => [styles.finalCta, pressed && { opacity: 0.8 }]}
        >
          <AppText variant="eyebrow" style={styles.pink}>READY WHEN YOU ARE</AppText>
          <AppText variant="h2" style={{ marginTop: 8 }}>Have something specific in mind?</AppText>
          <AppText muted style={{ marginTop: 7 }}>Jump back to the planner and tell us your way.</AppText>
        </Pressable>
      </ScrollView>
    </View>
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
  content: { paddingTop: 20, paddingBottom: 118, gap: 20 },
  heroGlow: { position: "absolute", top: -150, left: -110, width: 360, height: 360, borderRadius: 180, backgroundColor: "rgba(225,6,42,0.13)" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  profileButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  hero: { paddingTop: 12 },
  heroBody: { marginTop: 10, fontSize: 16, lineHeight: 24, maxWidth: 340 },
  searchShell: { borderWidth: 1, borderRadius: 24, padding: 8, gap: 8, marginTop: 20 },
  searchInput: { minHeight: 58, borderRadius: 18, paddingHorizontal: 16, fontSize: 16, fontWeight: "600" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 2 },
  occasionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  occasionCard: { width: "48%", minHeight: 62, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, justifyContent: "center" },
  horizontalRail: { gap: 12, paddingRight: 6 },
  areaCard: { width: 156, minHeight: 118, borderWidth: 1, borderRadius: 22, padding: 16, justifyContent: "flex-end" },
  inspirationCard: { width: 228, minHeight: 142, borderWidth: 1, borderRadius: 22, padding: 18, overflow: "hidden", justifyContent: "flex-end" },
  inspirationGlow: { position: "absolute", width: 150, height: 150, borderRadius: 75, right: -45, top: -55, backgroundColor: "rgba(225,6,42,0.18)" },
  pink: { color: "#ff8a9b" },
  finalCta: { borderRadius: 22, padding: 20, backgroundColor: "#120606", marginTop: 2 },
});
