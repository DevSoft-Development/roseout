import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { mobileApi } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme } from "@/providers/ThemeProvider";

type Tab = "upcoming" | "saved" | "completed" | "favorites";
type OutingItem = {
  id: string;
  title: string;
  status?: string;
  outingDate?: string | null;
  restaurant?: { name: string } | null;
  activity?: { name: string } | null;
};
type SavedItem = { id: string; title: string; summary?: string | null };
type FavoriteItem = { id: string; locationId?: string | null; name: string; category?: string | null };
type Payload = {
  ok: true;
  upcoming: OutingItem[];
  saved: SavedItem[];
  completed: OutingItem[];
  favorites: FavoriteItem[];
};

export default function OutingsScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { loading: authLoading, user } = useAuth();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setData(await mobileApi<Payload>("/outings"));
    } catch {
      setError("Your OUTings could not be loaded right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user?.id]);

  if (!authLoading && !user) {
    return (
      <FoundationScreen eyebrow="OUTINGS" title="Your OUTings" description="Sign in to sync saved plans, upcoming OUTings, completed experiences, and favorites across devices.">
        <Button onPress={() => router.push("/auth")}>Sign in</Button>
      </FoundationScreen>
    );
  }

  const items = data?.[tab] || [];

  return (
    <FoundationScreen eyebrow="OUTINGS" title="Your OUTings" description="Everything you saved, planned, completed, or favorited — synced to your TheOutHaven account.">
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <Chip label="Upcoming" selected={tab === "upcoming"} onPress={() => setTab("upcoming")} />
          <Chip label="Saved" selected={tab === "saved"} onPress={() => setTab("saved")} />
          <Chip label="Completed" selected={tab === "completed"} onPress={() => setTab("completed")} />
          <Chip label="Favorites" selected={tab === "favorites"} onPress={() => setTab("favorites")} />
        </View>

        {loading ? <AppText muted>Loading your OUTings...</AppText> : null}
        {error ? (
          <Card elevated>
            <AppText>{error}</AppText>
            <View style={{ marginTop: theme.spacing.md }}><Button variant="secondary" onPress={load}>Try again</Button></View>
          </Card>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <Card elevated>
            <AppText variant="h3">Nothing here yet</AppText>
            <AppText muted style={{ marginTop: 6 }}>
              {tab === "favorites" ? "Save a restaurant or thing to do and it will appear here." : "Plan or save an OUTing and it will appear here."}
            </AppText>
            <View style={{ marginTop: theme.spacing.md }}><Button onPress={() => router.push("/(tabs)/plan")}>Plan an OUTing</Button></View>
          </Card>
        ) : null}

        {items.map((item: any) => (
          <Card elevated key={item.id}>
            <AppText variant="eyebrow" accent>{tab === "favorites" ? "FAVORITE" : tab.toUpperCase()}</AppText>
            <AppText variant="h3" style={{ marginTop: 8 }}>{item.title || item.name || "TheOutHaven OUTing"}</AppText>
            {item.summary ? <AppText muted style={{ marginTop: 4 }}>{item.summary}</AppText> : null}
            {item.restaurant?.name ? <AppText muted style={{ marginTop: 4 }}>Dinner: {item.restaurant.name}</AppText> : null}
            {item.activity?.name ? <AppText muted>Then: {item.activity.name}</AppText> : null}
            {item.outingDate ? <AppText variant="caption" muted style={{ marginTop: 8 }}>{new Date(item.outingDate).toLocaleString()}</AppText> : null}
          </Card>
        ))}
      </View>
    </FoundationScreen>
  );
}
