import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAppTheme } from "@/providers/ThemeProvider";
import { outingRouteParams, placeRouteParams } from "@/lib/result-navigation";
import type { MobileOutingResult, MobilePlaceResult } from "@/lib/search-results";

function PlaceSummary({ place }: { place: MobilePlaceResult }) {
  const { theme } = useAppTheme();
  return (
    <View style={{ gap: 4 }}>
      <AppText variant="h3">{place.name}</AppText>
      {place.category ? <AppText muted>{place.category}</AppText> : null}
      <View style={{ flexDirection: "row", gap: theme.spacing.sm, flexWrap: "wrap" }}>
        {place.rating != null ? <AppText variant="caption">★ {place.rating.toFixed(1)}</AppText> : null}
        {place.priceLevel ? <AppText variant="caption">{place.priceLevel}</AppText> : null}
        {place.distanceMiles != null ? <AppText variant="caption">{place.distanceMiles.toFixed(1)} mi</AppText> : null}
      </View>
    </View>
  );
}

export function OutingResultCard({ outing }: { outing: MobileOutingResult }) {
  const { theme } = useAppTheme();
  const router = useRouter();
  return (
    <Card elevated>
      <AppText variant="eyebrow" accent>YOUR OUTING</AppText>
      <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
        {outing.restaurant ? (
          <Pressable onPress={() => router.push(placeRouteParams(outing.restaurant!))}>
            <PlaceSummary place={outing.restaurant} />
          </Pressable>
        ) : null}
        {outing.restaurant && outing.activity ? (
          <View style={{ alignItems: "center", gap: 4 }}>
            <AppText accent>↓</AppText>
            <AppText variant="caption" muted>
              {outing.walkMinutes != null ? `${Math.round(outing.walkMinutes)} min walk` : outing.distanceMiles != null ? `${outing.distanceMiles.toFixed(1)} mi apart` : "Nearby"}
            </AppText>
          </View>
        ) : null}
        {outing.activity ? (
          <Pressable onPress={() => router.push(placeRouteParams(outing.activity!))}>
            <PlaceSummary place={outing.activity} />
          </Pressable>
        ) : null}
        {outing.reason ? <AppText muted>{outing.reason}</AppText> : null}
        <Button onPress={() => router.push(outingRouteParams(outing))}>View OUTing</Button>
      </View>
    </Card>
  );
}

export function PlaceResultCard({ place }: { place: MobilePlaceResult }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(placeRouteParams(place))}>
      <Card elevated>
        <AppText variant="eyebrow" accent>{place.kind === "restaurant" ? "RESTAURANT" : "THING TO DO"}</AppText>
        <View style={{ marginTop: 10 }}>
          <PlaceSummary place={place} />
        </View>
      </Card>
    </Pressable>
  );
}
