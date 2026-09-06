import { useEffect, useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { mobileApi } from "@/lib/api";
import { useAppTheme } from "@/providers/ThemeProvider";

type Stop = { id?: string | null; name: string; address?: string | null; publicUrl?: string | null };
type Outing = { id: string; status: string; title: string; outingDate?: string | null; restaurant?: Stop | null; activity?: Stop | null; reservation?: Record<string, unknown>; completedAt?: string | null };

export default function ActiveOutingScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { theme } = useAppTheme();
  const [outing, setOuting] = useState<Outing | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await mobileApi<{ ok: true; outing: Outing }>(`/outings/${id}`);
      setOuting(result.outing);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id]);

  const leaveLabel = useMemo(() => {
    if (!outing?.outingDate) return "When you're ready, head to your first stop.";
    const target = new Date(outing.outingDate).getTime();
    const minutes = Math.round((target - Date.now()) / 60000);
    if (minutes <= 0) return "Your OUTing is ready to start.";
    if (minutes <= 60) return `About ${minutes} min until your planned start.`;
    return new Date(outing.outingDate).toLocaleString();
  }, [outing?.outingDate]);

  const start = async () => {
    if (!id) return;
    const result = await mobileApi<{ ok: true; outing: Outing }>(`/outings/${id}`, { method: "PATCH", body: JSON.stringify({ action: "start" }) });
    setOuting(result.outing);
  };

  const complete = async () => {
    if (!id) return;
    await mobileApi(`/outings/${id}`, { method: "PATCH", body: JSON.stringify({ action: "complete" }) });
    router.replace({ pathname: "/outing/[id]/complete", params: { id } });
  };

  if (loading || !outing) {
    return <FoundationScreen eyebrow="OUTING" title="Getting your OUTing ready" description="Loading your stops and reservation details..." />;
  }

  const active = outing.status === "active";
  const current = outing.restaurant || outing.activity;
  const next = outing.restaurant && outing.activity ? outing.activity : null;

  return (
    <FoundationScreen eyebrow={active ? "NOW" : "UPCOMING"} title={outing.title} description={leaveLabel}>
      <View style={{ gap: theme.spacing.md }}>
        {current ? (
          <Card elevated>
            <AppText variant="eyebrow" accent>{active ? "NOW" : "FIRST STOP"}</AppText>
            <AppText variant="h3" style={{ marginTop: 8 }}>{current.name}</AppText>
            {current.address ? <AppText muted style={{ marginTop: 4 }}>{current.address}</AppText> : null}
            <View style={{ marginTop: theme.spacing.md }}>
              {current.address ? <Button variant="secondary" onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(current.address || current.name)}`)}>Directions</Button> : null}
            </View>
          </Card>
        ) : null}

        {next ? (
          <Card elevated>
            <AppText variant="eyebrow" accent>NEXT</AppText>
            <AppText variant="h3" style={{ marginTop: 8 }}>{next.name}</AppText>
            {next.address ? <AppText muted style={{ marginTop: 4 }}>{next.address}</AppText> : null}
          </Card>
        ) : null}

        {Object.keys(outing.reservation || {}).length ? (
          <Card>
            <AppText variant="eyebrow" accent>RESERVATION</AppText>
            <AppText muted style={{ marginTop: 6 }}>Reservation details are attached to this OUTing and will stay with the active plan.</AppText>
          </Card>
        ) : null}

        {!active ? <Button onPress={start}>Start OUTing</Button> : <Button onPress={complete}>Complete OUTing</Button>}
      </View>
    </FoundationScreen>
  );
}
