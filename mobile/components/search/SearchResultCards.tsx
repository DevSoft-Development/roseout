import { Image, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAppTheme } from "@/providers/ThemeProvider";
import { outingRouteParams, placeRouteParams } from "@/lib/result-navigation";
import { outingCustomerReason, placeCustomerReason } from "@/lib/customer-reason";
import type { MobileOutingResult, MobilePlaceResult } from "@/lib/search-results";

const FALLBACK_IMAGE = "https://theouthaven.com/toh_logo.png";

function PlaceSummary({ place, label }: { place: MobilePlaceResult; label?: string }) {
  const { theme } = useAppTheme();
  return (
    <View style={[styles.venue, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
      <Image source={{ uri: place.imageUrl || FALLBACK_IMAGE }} style={[styles.heroImage, { backgroundColor: theme.colors.surfaceMuted }]} resizeMode="cover" />
      <View style={styles.venueCopy}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            {label ? <AppText variant="eyebrow" accent>{label}</AppText> : null}
            <AppText variant="h3" numberOfLines={2} style={{ marginTop: label ? 4 : 0 }}>{place.name}</AppText>
            {place.category ? <AppText variant="caption" muted numberOfLines={1} style={{ marginTop: 3 }}>{place.category}</AppText> : null}
          </View>
          <View style={[styles.openBadge, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceElevated }]}>
            <AppText variant="caption">↗</AppText>
          </View>
        </View>
        <View style={styles.metaRow}>
          {place.rating != null ? <AppText variant="caption">★ {place.rating.toFixed(1)}{place.reviewCount ? ` (${Math.round(place.reviewCount).toLocaleString()})` : ""}</AppText> : null}
          {place.priceLevel ? <AppText variant="caption">{place.priceLevel}</AppText> : null}
          {place.distanceMiles != null ? <AppText variant="caption">{place.distanceMiles.toFixed(1)} mi</AppText> : null}
        </View>
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
        : null;
  const why = outingCustomerReason(outing);

  return (
    <Card elevated style={{ padding: 12 }}>
      <View style={styles.cardTopline}>
        <View style={[styles.rankBadge, { backgroundColor: rank === 1 ? theme.colors.accent : theme.colors.surface, borderColor: rank === 1 ? theme.colors.accent : theme.colors.borderStrong }]}>
          <AppText variant="eyebrow" style={{ color: rank === 1 ? theme.colors.onAccent : theme.colors.text }}>{rank === 1 ? "BEST MATCH" : `OPTION ${rank}`}</AppText>
        </View>
        {distance ? <View style={[styles.distancePill, { backgroundColor: theme.colors.surfaceElevated }]}><AppText variant="caption" muted>{distance}</AppText></View> : null}
      </View>
      <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
        {outing.restaurant ? (
          <Pressable onPress={() => router.push(placeRouteParams(outing.restaurant!))} style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}>
            <PlaceSummary place={outing.restaurant} label={outing.resultType === "same_venue" ? "DINNER + EXPERIENCE" : "RESTAURANT"} />
          </Pressable>
        ) : null}
        {outing.restaurant && outing.activity && outing.resultType !== "same_venue" ? (
          <View style={styles.connector}>
            <View style={[styles.connectorLine, { backgroundColor: theme.colors.borderStrong }]} />
            {distance ? <View style={[styles.distancePill, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.borderStrong }]}><AppText variant="caption" muted>{distance}</AppText></View> : null}
            <View style={[styles.connectorLine, { backgroundColor: theme.colors.borderStrong }]} />
          </View>
        ) : null}
        {outing.activity && outing.resultType !== "same_venue" ? (
          <Pressable onPress={() => router.push(placeRouteParams(outing.activity!))} style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}>
            <PlaceSummary place={outing.activity} label="ACTIVITY" />
          </Pressable>
        ) : null}
        <View style={[styles.why, { borderTopColor: theme.colors.border }]}> 
          <AppText variant="eyebrow" accent>WHY YOU’LL LIKE IT</AppText>
          <AppText muted style={{ marginTop: 5, lineHeight: 22 }}>{why}</AppText>
        </View>
        <Button onPress={onChoose || (() => router.push(outingRouteParams(outing)))}>Choose this outing →</Button>
      </View>
    </Card>
  );
}

export function PlaceResultCard({ place, actionLabel, onAction, selected = false }: { place: MobilePlaceResult; actionLabel?: string; onAction?: () => void; selected?: boolean }) {
  const router = useRouter();
  const { theme } = useAppTheme();
  const why = placeCustomerReason(place);
  return (
    <Card elevated style={{ padding: 12, borderColor: selected ? theme.colors.accent : theme.colors.borderStrong }}>
      <Pressable onPress={() => router.push(placeRouteParams(place))} style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}>
        <PlaceSummary place={place} label={place.kind === "restaurant" ? "RESTAURANT" : "ACTIVITY"} />
      </Pressable>
      <View style={[styles.why, { borderTopColor: theme.colors.border }]}> 
        <AppText variant="eyebrow" accent>WHY YOU’LL LIKE IT</AppText>
        <AppText muted style={{ marginTop: 5, lineHeight: 22 }}>{why}</AppText>
      </View>
      {onAction ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <Button variant={selected ? "secondary" : "primary"} onPress={onAction}>{selected ? "✓ Selected" : actionLabel || "Select"}</Button>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTopline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  rankBadge: { minHeight: 30, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  venue: { overflow: "hidden", borderWidth: 1, borderRadius: 22 },
  heroImage: { width: "100%", height: 176 },
  venueCopy: { gap: 9, padding: 14 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  openBadge: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  connector: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8 },
  connectorLine: { height: 1, flex: 1 },
  distancePill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  why: { borderTopWidth: 1, paddingTop: 14 },
});