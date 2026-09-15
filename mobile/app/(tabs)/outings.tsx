import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { mobileApi } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme } from "@/providers/ThemeProvider";

type Tab = "upcoming" | "saved" | "completed" | "favorites";
type OutingItem = { id: string; title: string; status?: string; outingDate?: string | null; restaurant?: { name: string } | null; activity?: { name: string } | null };
type SavedItem = { id: string; title: string; summary?: string | null };
type FavoriteItem = { id: string; locationId?: string | null; name: string; category?: string | null };
type Payload = { ok: true; upcoming: OutingItem[]; saved: SavedItem[]; completed: OutingItem[]; favorites: FavoriteItem[] };

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "upcoming", label: "Upcoming" },
  { key: "saved", label: "Saved" },
  { key: "completed", label: "Past" },
  { key: "favorites", label: "Places" },
];

function formatOutingDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function OutingsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { loading: authLoading, user } = useAuth();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try { setData(await mobileApi<Payload>("/outings")); }
    catch { setError("Your OUTings could not be loaded right now."); }
    finally { setLoading(false); }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const counts = useMemo(() => ({
    upcoming: data?.upcoming.length || 0,
    saved: data?.saved.length || 0,
    completed: data?.completed.length || 0,
    favorites: data?.favorites.length || 0,
  }), [data]);

  if (!authLoading && !user) {
    return (
      <FoundationScreen eyebrow="MY OUTINGS" title="Keep the good plans close." description="Sign in to keep upcoming OUTings, saved ideas, past plans, and favorite places synced across devices." showHomeShortcut={false} showBrandHeader>
        <View style={styles.guestActions}>
          <Button onPress={() => router.push("/auth")}>Sign in</Button>
          <Button variant="secondary" onPress={() => router.push("/auth")}>Create account</Button>
        </View>
      </FoundationScreen>
    );
  }

  const items = data?.[tab] || [];
  return (
    <FoundationScreen eyebrow="MY OUTINGS" title="Your plans, all together." description="Pick up where you left off or revisit a place worth remembering." showHomeShortcut={false} showBrandHeader>
      <View style={styles.layout}>
        <View style={[styles.tabBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong }]}>
          {TABS.map(({ key, label }) => {
            const selected = key === tab;
            return (
              <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, selected && { backgroundColor: theme.colors.surfaceElevated }]}>
                <AppText variant="caption" accent={selected}>{label}</AppText>
                <View style={[styles.count, { backgroundColor: selected ? theme.colors.accentSoft : theme.colors.background }]}><AppText variant="caption" accent={selected}>{counts[key]}</AppText></View>
              </Pressable>
            );
          })}
        </View>

        {loading && !data ? <Card elevated><AppText muted>Bringing your OUTings together…</AppText></Card> : null}
        {error ? <Card elevated><AppText variant="h3">Couldn’t refresh your OUTings</AppText><AppText muted style={styles.cardCopy}>{error}</AppText><View style={styles.cardAction}><Button variant="secondary" onPress={load}>Try again</Button></View></Card> : null}

        {!loading && !error && items.length === 0 ? (
          <Card elevated>
            <AppText variant="eyebrow" accent>{tab === "favorites" ? "SAVE A PLACE" : "START SOMETHING"}</AppText>
            <AppText variant="h2" style={styles.emptyTitle}>{tab === "upcoming" ? "Nothing on the calendar yet." : tab === "saved" ? "No saved OUTings yet." : tab === "completed" ? "Your past OUTings will live here." : "No favorite places yet."}</AppText>
            <AppText muted style={styles.cardCopy}>{tab === "favorites" ? "Save places you want to come back to and they’ll stay within reach here." : "Find something that fits the moment, save it, and come back when you’re ready."}</AppText>
            <View style={styles.cardAction}><Button onPress={() => router.push(tab === "favorites" ? "/(tabs)/explore" : "/(tabs)/plan")}>{tab === "favorites" ? "Discover places" : "Plan an OUTing"}</Button></View>
          </Card>
        ) : null}

        {items.map((item: OutingItem | SavedItem | FavoriteItem) => {
          const outing = item as OutingItem;
          const saved = item as SavedItem;
          const favorite = item as FavoriteItem;
          const date = formatOutingDate(outing.outingDate);
          const title = "name" in item ? favorite.name : item.title || "TheOutHaven OUTing";
          return (
            <Card elevated key={item.id} style={styles.itemCard}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <AppText variant="eyebrow" accent>{tab === "favorites" ? favorite.category || "FAVORITE PLACE" : tab === "completed" ? "PAST OUTING" : tab === "saved" ? "SAVED OUTING" : outing.status === "active" ? "HAPPENING NOW" : "UPCOMING"}</AppText>
                  <AppText variant="h2" style={styles.itemTitle}>{title}</AppText>
                </View>
                <AppText muted style={styles.arrow}>›</AppText>
              </View>

              {date ? <View style={[styles.datePill, { backgroundColor: theme.colors.accentSoft }]}><AppText variant="caption" accent>{date}</AppText></View> : null}
              {saved.summary ? <AppText muted style={styles.cardCopy}>{saved.summary}</AppText> : null}
              {outing.restaurant?.name || outing.activity?.name ? (
                <View style={styles.route}>
                  {outing.restaurant?.name ? <RouteStop number="1" label="DINNER" name={outing.restaurant.name} /> : null}
                  {outing.restaurant?.name && outing.activity?.name ? <View style={[styles.routeLine, { backgroundColor: theme.colors.borderStrong }]} /> : null}
                  {outing.activity?.name ? <RouteStop number={outing.restaurant?.name ? "2" : "1"} label="NEXT" name={outing.activity.name} /> : null}
                </View>
              ) : null}

              <Pressable onPress={() => {
                if (tab === "favorites" && favorite.locationId) router.push({ pathname: "/location/[id]", params: { id: favorite.locationId } });
                else if (tab === "upcoming" || tab === "completed") router.push({ pathname: "/outing/[id]/active", params: { id: item.id } });
              }} style={styles.openRow}>
                <AppText variant="bodyStrong" accent>{tab === "favorites" ? "View place" : tab === "completed" ? "View OUTing" : tab === "saved" ? "Saved for later" : outing.status === "active" ? "Continue OUTing" : "Open OUTing"}</AppText>
              </Pressable>
            </Card>
          );
        })}
      </View>
    </FoundationScreen>
  );
}

function RouteStop({ number, label, name }: { number: string; label: string; name: string }) {
  const { theme } = useAppTheme();
  return <View style={styles.routeStop}><View style={[styles.stopNumber, { backgroundColor: theme.colors.accentSoft }]}><AppText variant="caption" accent>{number}</AppText></View><View style={{ flex: 1 }}><AppText variant="caption" muted>{label}</AppText><AppText variant="bodyStrong" style={{ marginTop: 2 }}>{name}</AppText></View></View>;
}

const styles = StyleSheet.create({
  layout: { gap: 14 }, guestActions: { gap: 10 },
  tabBar: { flexDirection: "row", borderWidth: 1, borderRadius: 20, padding: 4, gap: 2 },
  tab: { flex: 1, minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 4 },
  count: { minWidth: 22, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  cardCopy: { marginTop: 8, lineHeight: 21 }, cardAction: { marginTop: 18 }, emptyTitle: { marginTop: 8 }, itemCard: { overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 }, itemTitle: { marginTop: 6 }, arrow: { fontSize: 30, lineHeight: 32 },
  datePill: { alignSelf: "flex-start", marginTop: 12, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  route: { marginTop: 16, gap: 5 }, routeStop: { flexDirection: "row", alignItems: "center", gap: 11 }, stopNumber: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" }, routeLine: { width: 2, height: 13, marginLeft: 14 },
  openRow: { minHeight: 44, marginTop: 13, justifyContent: "center", alignItems: "flex-start" },
});
