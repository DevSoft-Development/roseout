import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAppTheme } from "@/providers/ThemeProvider";

export default function CompleteOutingScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { theme } = useAppTheme();

  return (
    <FoundationScreen eyebrow="COMPLETE" title="How was your OUTing?" description="Your OUTing is marked complete. Share quick feedback so TheOutHaven can personalize future plans.">
      <View style={{ gap: theme.spacing.md }}>
        <Card elevated>
          <AppText variant="h3">Rate the experience</AppText>
          <AppText muted style={{ marginTop: 6 }}>Restaurant, activity, overall vibe, photos, and detailed review entry will plug into the existing post-visit review pipeline in the next review-focused phase.</AppText>
        </Card>
        <Button onPress={() => router.replace("/(tabs)/outings")}>Back to My OUTings</Button>
        {id ? <Button variant="secondary" onPress={() => router.replace({ pathname: "/outing/[id]/active", params: { id } })}>View completed OUTing</Button> : null}
      </View>
    </FoundationScreen>
  );
}
