import { Image, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAppTheme } from "@/providers/ThemeProvider";
import { outingRouteParams, placeRouteParams } from "@/lib/result-navigation";
import type { MobileOutingResult, MobilePlaceResult } from "@/lib/search-results";

const FALLBACK_IMAGE = "https://theouthaven.com/toh_logo.png";

function PlaceSummary({ place, label }: { place: MobilePlaceResult; label?: string }) {
  const { theme } = useAppTheme();
  return (
    <View style={[styles.venueRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
      <Image source={{ uri: place.imageUrl || FALLBACK_IMAGE }} style={styles.thumb} resizeMode="cover" />
      <View style={styles.venueCopy}>
        {label ? <AppText variant="eyebrow" accent>{label}</AppText> : null}
        <AppText variant="h3" numberOfLines={1}>{place.name}</AppText>
        {place.category ? <AppText variant="caption" muted numberOfLines={1}>{place.category}</AppText> : null}
        <View style={styles.metaRow}>
          {place.rating != null ? <AppText variant="caption">★ {place.rating.toFixed(1)}{place.reviewCount ? ` (${Math.round(place.reviewCount).toLocaleString()})` : ""}</AppText> : null}
          {place.priceLevel ? <AppText variant="caption">{place.priceLevel}</AppText> : null}
          {place.distanceMiles != null ? <AppText variant="caption">{place.distanceMiles.toFixed(1)} mi</AppText> : null}
        </View>
        {place.reservationUrl ? <AppText variant="caption" style={{ color: theme.colors.accent }}>Reservation link found</AppText> : null}
      </View>
    </View>
  );
}

export function OutingResultCard({ outing, rank = 1, onChoose }: { outing: MobileOutingResult; rank?: number; onChoose?: () => void }) {
  const { theme } = useAppTheme();
  const router = useRouter();
  const distance = outing.resultType === "same_venue"
    ? "Same venue"
    : outing.walkMinutes != null
      ? `${Math.round(outing.walkMinutes)} min walk`
      : outing.distanceMiles != null
        ? `${outing.distanceMiles.toFixed(1)} mi apart`
        : "Nearby";

  return (
    <Card elevated>
      <View style={styles.cardTopline}>
        <AppText variant="eyebrow" accent>{rank === 1 ? "BEST MATCH" : `OPTION ${rank}`}</AppText>
        <AppText variant="caption" muted>{distance}</AppText>
      </View>
      <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
        {outing.restaurant ? (
          <Pressable onPress={() => router.push(placeRouteParams(outing.restaurant!))}>
            <PlaceSummary place={outing.restaurant} label={outing.resultType === "same_venue" ? "RESTAURANT + ACTIVITY" : "RESTAURANT"} />
          </Pressable>
        ) : null}
        {outing.restaurant && outing.activity && outing.resultType !== "same_venue" ? (
          <View style={styles.connector}>
            <AppText accent>↓</AppText>
            <AppText variant="caption" muted>{distance}</AppText>
          </View>
        ) : null}
        {outing.activity && outing.resultType !== "same_venue" ? (
          <Pressable onPress={() => router.push(placeRouteParams(outing.activity!))}>
            <PlaceSummary place={outing.activity} label="ACTIVITY" />
          </Pressable>
        ) : null}
        {outing.reason ? (
          <View style={[styles.why, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
            <AppText variant="eyebrow" accent>WHY IT FITS</AppText>
            <AppText muted style={{ marginTop: 4 }}>{outing.reason}</AppText>
          </View>
        ) : null}
        <Button onPress={onChoose || (() => router.push(outingRouteParams(outing)))}>Choose this OUTing →</Button>
      </View>
    </Card>
  );
}

export function PlaceResultCard({ place, actionLabel, onAction, selected = false }: { place: MobilePlaceResult; actionLabel?: string; onAction?: () => void; selected?: boolean }) {
  const router = useRouter();
  const { theme } = useAppTheme();
  return (
    <Card elevated>
      <Pressable onPress={() => router.push(placeRouteParams(place))}>
        <PlaceSummary place={place} label={place.kind === "restaurant" ? "RESTAURANT" : "THING TO DO"} />
      </Pressable>
      {place.whyMatched ? <AppText muted style={{ marginTop: theme.spacing.sm }}>{place.whyMatched}</AppText> : null}
      {onAction ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <Button variant={selected ? "secondary" : "primary"} onPress={onAction}>{selected ? "Selected" : actionLabel || "Select"}</Button>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTopline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  venueRow: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 18, padding: 10 },
  thumb: { width: 92, height: 92, borderRadius: 14 },
  venueCopy: { flex: 1, gap: 4, justifyContent: "center" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  connector: { alignItems: "center", gap: 2 },
  why: { borderWidth: 1, borderRadius: 16, padding: 12 },
});
