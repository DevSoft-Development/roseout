import { useState } from "react";
import { Alert, Linking, Share, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { mobileApi } from "@/lib/api";
import { mobileConfig } from "@/lib/config";
import { useAppTheme } from "@/providers/ThemeProvider";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] || "" : input || "";
}

export default function LocationDetailScreen() {
  const params = useLocalSearchParams();
  const { theme } = useAppTheme();
  const requireAuth = useRequireAuth();
  const [saved, setSaved] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const id = value(params.id);
  const name = value(params.name) || "TheOutHaven location";
  const publicUrl = value(params.publicUrl);
  const reservationUrl = value(params.reservationUrl);
  const websiteUrl = value(params.websiteUrl);
  const phone = value(params.phone);
  const address = value(params.address);
  const latitude = value(params.latitude);
  const longitude = value(params.longitude);

  const openDirections = async () => {
    const destination = latitude && longitude ? `${latitude},${longitude}` : address || name;
    await Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(destination)}`);
  };

  const save = () => {
    requireAuth(async () => {
      setSaving(true);
      try {
        if (saved && favoriteId) {
          await mobileApi(`/favorites?id=${encodeURIComponent(favoriteId)}`, { method: "DELETE" });
          setSaved(false);
          setFavoriteId(null);
          return;
        }

        const result = await mobileApi<{ ok: true; favoriteId: string }>("/favorites", {
          method: "POST",
          body: JSON.stringify({
            locationId: id,
            name,
            kind: value(params.kind),
            category: value(params.category),
            publicUrl,
          }),
        });
        setFavoriteId(result.favoriteId);
        setSaved(true);
      } catch {
        Alert.alert("Save unavailable", "This favorite could not be synced yet.");
      } finally {
        setSaving(false);
      }
    });
  };

  const share = async () => {
    const rawDestination = publicUrl || (id ? `/locations/${encodeURIComponent(id)}` : "");
    if (!rawDestination) return Alert.alert("Share unavailable", "A public link is not available for this location yet.");
    const destinationUrl = rawDestination.startsWith("http") ? rawDestination : `${mobileConfig.siteUrl}${rawDestination.startsWith("/") ? "" : "/"}${rawDestination}`;

    setSharing(true);
    try {
      const result = await mobileApi<{ ok: true; shortUrl: string }>("/share", {
        method: "POST",
        body: JSON.stringify({
          destinationUrl,
          entityType: "location",
          entityId: id,
          title: name,
        }),
      });
      await Share.share({ message: `${name}\n${result.shortUrl}` });
    } catch {
      await Share.share({ message: `${name}\n${destinationUrl}` });
    } finally {
      setSharing(false);
    }
  };

  return (
    <FoundationScreen
      eyebrow={value(params.kind) === "activity" ? "THING TO DO" : "RESTAURANT"}
      title={name}
      description={value(params.category) || address || "Location details"}
    >
      <View style={{ gap: theme.spacing.md }}>
        <Card elevated>
          <View style={{ gap: 6 }}>
            {value(params.rating) ? <AppText>★ {Number(value(params.rating)).toFixed(1)}</AppText> : null}
            {value(params.priceLevel) ? <AppText muted>{value(params.priceLevel)}</AppText> : null}
            {address ? <AppText muted>{address}</AppText> : null}
          </View>
        </Card>

        {reservationUrl ? <Button onPress={() => Linking.openURL(reservationUrl)}>Reserve</Button> : null}
        {!reservationUrl && websiteUrl ? <Button onPress={() => Linking.openURL(websiteUrl)}>Official website</Button> : null}
        {phone ? <Button variant="secondary" onPress={() => Linking.openURL(`tel:${phone.replace(/[^+\d]/g, "")}`)}>Call</Button> : null}
        {(latitude && longitude) || address ? <Button variant="secondary" onPress={openDirections}>Directions</Button> : null}
        <Button variant="secondary" disabled={saving} onPress={save}>{saving ? "Saving..." : saved ? "Saved" : "Save"}</Button>
        <Button variant="ghost" disabled={sharing} onPress={share}>{sharing ? "Preparing link..." : "Share"}</Button>
      </View>
    </FoundationScreen>
  );
}
