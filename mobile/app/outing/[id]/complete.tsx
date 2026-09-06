import { useState } from "react";
import { Alert, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import { mobileApi } from "@/lib/api";
import { useAppTheme } from "@/providers/ThemeProvider";

function RatingRow({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="h3">{label}</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <Chip key={rating} label={`${rating} ★`} selected={value === rating} onPress={() => onChange(rating)} />
        ))}
      </View>
    </View>
  );
}

export default function CompleteOutingScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { theme } = useAppTheme();
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [restaurantRating, setRestaurantRating] = useState<number | null>(null);
  const [activityRating, setActivityRating] = useState<number | null>(null);
  const [matchedVibe, setMatchedVibe] = useState<boolean | null>(null);
  const [wouldGoAgain, setWouldGoAgain] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState("");
  const [restaurantFeedback, setRestaurantFeedback] = useState("");
  const [activityFeedback, setActivityFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!id || !overallRating || submitting) return;
    setSubmitting(true);
    try {
      await mobileApi(`/outings/${encodeURIComponent(id)}/review`, {
        method: "POST",
        body: JSON.stringify({
          overallRating,
          restaurantRating,
          activityRating,
          matchedVibe,
          wouldGoAgain,
          feedback,
          restaurantFeedback,
          activityFeedback,
        }),
      });
      Alert.alert("Thanks for the feedback", "Your ratings will help TheOutHaven improve future OUTings for you.");
      router.replace("/(tabs)/outings");
    } catch (error) {
      Alert.alert("Could not save feedback", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FoundationScreen eyebrow="COMPLETE" title="How was your OUTing?" description="Rate each stop and tell TheOutHaven what worked. Your feedback helps personalize what you see next.">
      <View style={{ gap: theme.spacing.md }}>
        <Card elevated>
          <View style={{ gap: theme.spacing.lg }}>
            <RatingRow label="Overall OUTing" value={overallRating} onChange={setOverallRating} />
            <RatingRow label="Restaurant" value={restaurantRating} onChange={setRestaurantRating} />
            <RatingRow label="Thing to do" value={activityRating} onChange={setActivityRating} />
          </View>
        </Card>

        <Card elevated>
          <AppText variant="h3">Did it match the vibe?</AppText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <Chip label="Yes" selected={matchedVibe === true} onPress={() => setMatchedVibe(true)} />
            <Chip label="Not really" selected={matchedVibe === false} onPress={() => setMatchedVibe(false)} />
          </View>
        </Card>

        <Card elevated>
          <AppText variant="h3">Would you do a similar OUTing again?</AppText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <Chip label="Yes" selected={wouldGoAgain === true} onPress={() => setWouldGoAgain(true)} />
            <Chip label="No" selected={wouldGoAgain === false} onPress={() => setWouldGoAgain(false)} />
          </View>
        </Card>

        <Card elevated>
          <AppText variant="h3">Anything else?</AppText>
          <AppText muted style={{ marginTop: 4, marginBottom: 10 }}>Optional private feedback about the full OUTing.</AppText>
          <SearchField multiline value={feedback} onChangeText={setFeedback} placeholder="What should TheOutHaven learn from this OUTing?" style={{ minHeight: 90, textAlignVertical: "top" }} />
        </Card>

        <Card elevated>
          <AppText variant="h3">Leave a restaurant review</AppText>
          <AppText muted style={{ marginTop: 4, marginBottom: 10 }}>Optional. Reviews with at least 30 characters can enter the normal moderation queue.</AppText>
          <SearchField multiline value={restaurantFeedback} onChangeText={setRestaurantFeedback} placeholder="How was the food, service, atmosphere, or value?" style={{ minHeight: 100, textAlignVertical: "top" }} />
        </Card>

        <Card elevated>
          <AppText variant="h3">Leave an activity review</AppText>
          <AppText muted style={{ marginTop: 4, marginBottom: 10 }}>Optional. Tell others what the experience was really like.</AppText>
          <SearchField multiline value={activityFeedback} onChangeText={setActivityFeedback} placeholder="What stood out about the experience?" style={{ minHeight: 100, textAlignVertical: "top" }} />
        </Card>

        <Button disabled={!overallRating || submitting} onPress={submit}>{submitting ? "Saving..." : "Submit feedback"}</Button>
        <Button variant="secondary" onPress={() => router.replace("/(tabs)/outings")}>Skip for now</Button>
        {id ? <Button variant="ghost" onPress={() => router.replace({ pathname: "/outing/[id]/active", params: { id } })}>View completed OUTing</Button> : null}
      </View>
    </FoundationScreen>
  );
}
