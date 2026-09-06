import { useState } from "react";
import { Alert, Linking, Share, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAppTheme } from "@/providers/ThemeProvider";

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] || "" : input || "";
}

export default function LocationDetailScreen() {
  const params = useLocalSearchParams<Record<string, string | string[] | undefined>>();
  const { theme } = useAppTheme();
  const requireAuth = useRequireAuth();
  const [saved, setSaved] = useState(false);
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
    requireAuth(() => setSaved((current) => !current));
  };

  const share = async () => {
    const url = publicUrl || websiteUrl;
    if (!url) return Alert.alert("Share unavailable", "A public link is not available for this location yet.");
    await Share.share({ message: `${name}\n${url}` });
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
        <Button variant="secondary" onPress={save}>{saved ? "Saved" : "Save"}</Button>
        <Button variant="ghost" onPress={share}>Share</Button>
      </View>
    </FoundationScreen>
  );
}
