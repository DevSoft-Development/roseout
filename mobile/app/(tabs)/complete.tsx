import { useMemo, useState } from "react";
import { Alert, Image, Share, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { JourneySteps } from "@/components/planner/JourneySteps";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { mobileApi } from "@/lib/api";
import { placeRouteParams } from "@/lib/result-navigation";
import type { MobilePlaceResult } from "@/lib/search-results";
import { useAppTheme } from "@/providers/ThemeProvider";

const FALLBACK_IMAGE = "https://theouthaven.com/toh_logo.png";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] || "" : input || "";
}

function parsePlace(raw: string): MobilePlaceResult | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as MobilePlaceResult; } catch { return null; }
}

function PlaceBlock({ label, place, onOpen }: { label: string; place: MobilePlaceResult | null; onOpen: () => void }) {
  const { theme } = useAppTheme();
  if (!place) return null;
  return (
    <Card elevated>
      <Image source={{ uri: place.imageUrl || FALLBACK_IMAGE }} style={{ width: "100%", height: 180, borderRadius: 16 }} resizeMode="cover" />
      <AppText variant="eyebrow" accent style={{ marginTop: theme.spacing.md }}>{label}</AppText>
      <AppText variant="h3" style={{ marginTop: 6 }}>{place.name}</AppText>
      {place.category ? <AppText muted style={{ marginTop: 4 }}>{place.category}</AppText> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {place.rating != null ? <AppText variant="caption">★ {place.rating.toFixed(1)}</AppText> : null}
        {place.priceLevel ? <AppText variant="caption">{place.priceLevel}</AppText> : null}
        {place.reservationUrl ? <AppText variant="caption" style={{ color: theme.colors.accent }}>Reservation link found</AppText> : null}
      </View>
      <View style={{ marginTop: 14 }}>
        <Button variant="secondary" onPress={onOpen}>View {label.toLowerCase()}</Button>
      </View>
    </Card>
  );
}

export default function CompleteOutingScreen() {
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
  const resultType = value(params.resultType) || "pair";

  const travelLabel = resultType === "same_venue"
    ? "Everything at one venue"
    : walkMinutes
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
            resultType,
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
    if (activity && activity.id !== restaurant?.id) lines.push(`Then: ${activity.name}${activity.publicUrl ? ` — ${activity.publicUrl}` : ""}`);
    lines.push(travelLabel);
    await Share.share({ message: lines.join("\n") });
  };

  return (
    <FoundationScreen title="Complete your OUTing" description={reason || travelLabel}>
      <View style={{ gap: theme.spacing.lg }}>
        <BrandHeader compact />
        <JourneySteps activeStep={4} />
        <Button variant="ghost" fullWidth={false} onPress={() => router.back()}>← Back to picks</Button>

        <PlaceBlock label={resultType === "same_venue" ? "RESTAURANT + ACTIVITY" : "RESTAURANT"} place={restaurant} onOpen={() => restaurant && router.push(placeRouteParams(restaurant))} />
        {restaurant && activity && activity.id !== restaurant.id ? (
          <View style={{ alignItems: "center", gap: 4 }}>
            <AppText accent>↓</AppText>
            <AppText muted>{travelLabel}</AppText>
          </View>
        ) : null}
        {activity && activity.id !== restaurant?.id ? <PlaceBlock label="THING TO DO" place={activity} onOpen={() => activity && router.push(placeRouteParams(activity))} /> : null}

        <Card>
          <AppText variant="eyebrow" accent>NEXT</AppText>
          <AppText variant="h3" style={{ marginTop: 6 }}>Lock in the plan</AppText>
          <AppText muted style={{ marginTop: 6 }}>Open venue details for reservation or booking links, then save the OUTing for reminders and easy return access.</AppText>
        </Card>

        <Button disabled={saving} onPress={save}>{saving ? "Saving..." : saved ? "Saved" : "Save OUTing"}</Button>
        <Button variant="secondary" onPress={share}>Share OUTing</Button>
      </View>
    </FoundationScreen>
  );
}
