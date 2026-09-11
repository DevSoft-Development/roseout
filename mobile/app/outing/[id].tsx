import { useMemo, useState } from "react";
import { Alert, Share, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { mobileApi } from "@/lib/api";
import { placeRouteParams } from "@/lib/result-navigation";
import type { MobilePlaceResult } from "@/lib/search-results";
import { useAppTheme } from "@/providers/ThemeProvider";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] || "" : input || "";
}

function parsePlace(raw: string): MobilePlaceResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MobilePlaceResult;
  } catch {
    return null;
  }
}

function PlaceBlock({ label, place, onOpen }: { label: string; place: MobilePlaceResult | null; onOpen: () => void }) {
  if (!place) return null;
  return (
    <Card elevated>
      <AppText variant="eyebrow" accent>{label}</AppText>
      <AppText variant="h3" style={{ marginTop: 8 }}>{place.name}</AppText>
      {place.category ? <AppText muted style={{ marginTop: 4 }}>{place.category}</AppText> : null}
      <View style={{ marginTop: 14 }}>
        <Button variant="secondary" onPress={onOpen}>View {label.toLowerCase()}</Button>
      </View>
    </Card>
  );
}

export default function OutingDetailScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const { theme } = useAppTheme();
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const restaurant = useMemo(() => parsePlace(value(params.restaurant)), [params.restaurant]);
  const activity = useMemo(() => parsePlace(value(params.activity)), [params.activity]);
  const walkMinutes = value(params.walkMinutes);
  const distanceMiles = value(params.distanceMiles);
  const reason = value(params.reason);

  const travelLabel = walkMinutes
    ? `${Math.round(Number(walkMinutes))} min walk between stops`
    : distanceMiles
      ? `${Number(distanceMiles).toFixed(1)} mi between stops`
      : "Nearby stops";

  const save = () => requireAuth(async () => {
    setSaving(true);
    try {
      if (saved && savedId) {
        await mobileApi(`/outings?id=${encodeURIComponent(savedId)}`, { method: "DELETE" });
        setSaved(false);
        setSavedId(null);
        return;
      }

      const result = await mobileApi<{ ok: true; outingId: string }>("/outings", {
        method: "POST",
        body: JSON.stringify({
          title: "My TheOutHaven OUTing",
          status: "saved",
          restaurant,
          activity,
          dedupeKey: value(params.id) || undefined,
          planPayload: {
            walkMinutes: walkMinutes ? Number(walkMinutes) : null,
            distanceMiles: distanceMiles ? Number(distanceMiles) : null,
            reason: reason || null,
          },
        }),
      });
      setSavedId(result.outingId);
      setSaved(true);
    } catch {
      Alert.alert("Save unavailable", "This OUTing could not be synced yet.");
    } finally {
      setSaving(false);
    }
  });

  const share = async () => {
    const lines = ["My TheOutHaven OUTing"];
    if (restaurant) lines.push(`Dinner: ${restaurant.name}${restaurant.publicUrl ? ` — ${restaurant.publicUrl}` : ""}`);
    if (activity) lines.push(`Then: ${activity.name}${activity.publicUrl ? ` — ${activity.publicUrl}` : ""}`);
    lines.push(travelLabel);
    await Share.share({ message: lines.join("\n") });
  };

  const swapRestaurant = () => {
    const anchor = activity ? ` near ${activity.name}` : "";
    router.push({ pathname: "/(tabs)/plan", params: { prompt: `Find another restaurant${anchor}` } });
  };

  const swapActivity = () => {
    const anchor = restaurant ? ` near ${restaurant.name}` : "";
    router.push({ pathname: "/(tabs)/plan", params: { prompt: `Find another activity${anchor}` } });
  };

  return (
    <FoundationScreen
      eyebrow="OUTING"
      title="Your OUTing"
      description={reason || travelLabel}
    >
      <View style={{ gap: theme.spacing.md }}>
        <PlaceBlock
          label="RESTAURANT"
          place={restaurant}
          onOpen={() => restaurant && router.push(placeRouteParams(restaurant))}
        />
        {restaurant && activity ? (
          <View style={{ alignItems: "center", gap: 4 }}>
            <AppText accent>↓</AppText>
            <AppText muted>{travelLabel}</AppText>
          </View>
        ) : null}
        <PlaceBlock
          label="THING TO DO"
          place={activity}
          onOpen={() => activity && router.push(placeRouteParams(activity))}
        />

        <Button disabled={saving} onPress={save}>{saving ? "Saving..." : saved ? "Saved" : "Save OUTing"}</Button>
        <Button variant="secondary" onPress={share}>Share OUTing</Button>
        {restaurant ? <Button variant="ghost" onPress={swapRestaurant}>Swap restaurant</Button> : null}
        {activity ? <Button variant="ghost" onPress={swapActivity}>Swap activity</Button> : null}
      </View>
    </FoundationScreen>
  );
}
