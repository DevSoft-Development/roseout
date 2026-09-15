import { useCallback, useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { AppText } from "@/components/ui/AppText";
import { mobileApi } from "@/lib/api";
import { useAppTheme } from "@/providers/ThemeProvider";

type DiscoverItem = {
  id: string;
  section_id: string;
  title: string;
  subtitle: string | null;
  href: string | null;
  query: string | null;
  badge: string | null;
  sponsored: boolean;
  sponsor_label: string | null;
};

type DiscoverSection = {
  id: string;
  eyebrow: string | null;
  title: string;
  description: string | null;
  items: DiscoverItem[];
};

type DiscoverResponse = { ok: true; sections: DiscoverSection[] };

export default function ExploreScreen() {
  const { theme } = useAppTheme();
  const [sections, setSections] = useState<DiscoverSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadDiscover = useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);

    mobileApi<DiscoverResponse>("/discover")
      .then((data) => {
        if (!active) return;
        setSections(Array.isArray(data.sections) ? data.sections : []);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadDiscover);

  const visible = useMemo(() => sections.filter((section) => section.items?.length), [sections]);

  const openItem = (item: DiscoverItem) => {
    const prompt = (item.query || item.title).trim();
    router.push({
      pathname: "/(tabs)/plan",
      params: {
        prompt,
        planType: "outing",
        startAt: "2",
        source: "discover",
      },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View pointerEvents="none" style={styles.glow} />
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: theme.spacing.lg }]} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <BrandHeader compact />
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            style={({ pressed }) => [styles.profileButton, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }, pressed && { opacity: 0.72 }]}
          >
            <AppText variant="bodyStrong">○</AppText>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <AppText variant="eyebrow" accent>DISCOVER</AppText>
          <AppText variant="display" style={styles.heroTitle}>Find your next OUTing.</AppText>
          <AppText muted style={styles.heroBody}>Browse ideas, areas, popular searches, featured places, and complete plans without needing to know what to type.</AppText>
        </View>

        {loading && visible.length === 0 ? (
          <View style={[styles.loadingCard, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]}>
            <AppText variant="bodyStrong">Finding ideas worth going out for…</AppText>
          </View>
        ) : null}

        {loadError && visible.length === 0 ? (
          <Pressable onPress={loadDiscover} style={[styles.loadingCard, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }]}>
            <AppText variant="bodyStrong">Discover could not refresh.</AppText>
            <AppText muted style={{ marginTop: 6 }}>Tap to try again.</AppText>
          </Pressable>
        ) : null}

        {visible.map((section) => (
          <View key={section.id} style={styles.section}>
            {section.eyebrow ? <AppText variant="eyebrow" accent>{section.eyebrow}</AppText> : null}
            <AppText variant="h2" style={styles.sectionTitle}>{section.title}</AppText>
            {section.description ? <AppText muted style={styles.sectionBody}>{section.description}</AppText> : null}

            {section.id === "popular-searches" ? (
              <View style={styles.chips}>
                {section.items.map((item) => (
                  <Pressable key={item.id} onPress={() => openItem(item)} style={({ pressed }) => [styles.chip, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }, pressed && { opacity: 0.72 }]}>
                    <AppText variant="caption">{item.title}</AppText>
                  </Pressable>
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalRow}>
                {section.items.map((item) => (
                  <Pressable key={item.id} onPress={() => openItem(item)} style={({ pressed }) => [styles.card, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceElevated }, pressed && { opacity: 0.78 }]}>
                    <View style={styles.badgeRow}>
                      {item.badge ? <AppText variant="caption" accent>{item.badge}</AppText> : <View />}
                      {item.sponsored ? <AppText variant="caption" muted>{item.sponsor_label || "Sponsored"}</AppText> : null}
                    </View>
                    <View>
                      <AppText variant="h3">{item.title}</AppText>
                      {item.subtitle ? <AppText muted style={styles.cardBody}>{item.subtitle}</AppText> : null}
                      <AppText accent style={styles.cardArrow}>View idea →</AppText>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        ))}

        <View style={[styles.cta, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceElevated }]}>
          <AppText variant="eyebrow" accent>HAVE SOMETHING SPECIFIC IN MIND?</AppText>
          <AppText variant="h2" style={styles.sectionTitle}>Tell us what you want. We’ll build the outing.</AppText>
          <Pressable onPress={() => router.push("/(tabs)/plan")} style={styles.ctaButton}>
            <AppText variant="bodyStrong" style={{ color: "#ffffff" }}>Plan my OUTing</AppText>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, paddingBottom: 120 },
  glow: { position: "absolute", top: -120, left: -100, width: 320, height: 320, borderRadius: 160, backgroundColor: "rgba(225,6,42,0.12)" },
  headerRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  profileButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  hero: { paddingTop: 28, paddingBottom: 20 },
  heroTitle: { marginTop: 8 },
  heroBody: { marginTop: 10, lineHeight: 22, maxWidth: 560 },
  loadingCard: { marginTop: 8, borderWidth: 1, borderRadius: 22, padding: 18 },
  section: { marginTop: 34 },
  sectionTitle: { marginTop: 6 },
  sectionBody: { marginTop: 6, lineHeight: 20 },
  horizontalRow: { gap: 12, paddingTop: 14, paddingRight: 18 },
  card: { width: 268, minHeight: 190, borderWidth: 1, borderRadius: 24, padding: 18, justifyContent: "space-between" },
  badgeRow: { minHeight: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardBody: { marginTop: 7, lineHeight: 20 },
  cardArrow: { marginTop: 14, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 14 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  cta: { marginTop: 40, borderWidth: 1, borderRadius: 28, padding: 20 },
  ctaButton: { marginTop: 18, alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#e1062a", paddingHorizontal: 18, paddingVertical: 12 },
});
