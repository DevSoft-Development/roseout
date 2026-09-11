import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { JourneySteps } from "@/components/planner/JourneySteps";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SearchLoadingJourney } from "@/components/search/SearchLoadingJourney";
import { OutingResultCard, PlaceResultCard } from "@/components/search/SearchResultCards";
import { mobileApi, MobileApiError } from "@/lib/api";
import { outingRouteParams } from "@/lib/result-navigation";
import type { MobileOutingResult, MobilePlaceResult, MobileSearchResponse } from "@/lib/search-results";
import { useAppTheme } from "@/providers/ThemeProvider";

type ResultParams = Record<string, string | undefined>;
type PlanType = "outing" | "restaurant" | "activity";

function parseArray(raw: string | undefined) {
  if (!raw) return [] as string[];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function headingFor(planType: PlanType) {
  if (planType === "restaurant") return "Your best restaurants, curated.";
  if (planType === "activity") return "Your best activities, curated.";
  return "Your best options, curated.";
}

export default function ResultsScreen() {
  const params = useLocalSearchParams() as ResultParams;
  const router = useRouter();
  const { theme } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<MobileSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<MobilePlaceResult | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<MobilePlaceResult | null>(null);

  const planType: PlanType = params.planType === "restaurant" || params.planType === "activity" ? params.planType : "outing";
  const requestBody = useMemo(() => ({
    query: params.query || "",
    planType,
    when: params.when || "none",
    customDate: params.customDate || "",
    customTime: params.customTime || "",
    area: params.area || "Near me",
    partySize: params.partySize || "2",
    budget: params.budget || "$$",
    travel: params.travel || "nearby",
    preferences: parseArray(params.preferences),
    customMatters: parseArray(params.customMatters),
  }), [
    params.query,
    planType,
    params.when,
    params.customDate,
    params.customTime,
    params.area,
    params.partySize,
    params.budget,
    params.travel,
    params.preferences,
    params.customMatters,
  ]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await mobileApi<MobileSearchResponse>("/search", { method: "POST", body: JSON.stringify(requestBody) });
      setResult(response);
    } catch (searchError) {
      setResult(null);
      setError(searchError instanceof MobileApiError ? searchError.message : "We couldn’t build your picks right now.");
    } finally {
      setLoading(false);
    }
  }, [requestBody]);

  useEffect(() => { void runSearch(); }, [runSearch]);

  const recommended = [...(result?.pairs || []), ...(result?.sameVenueResults || [])].slice(0, 6);
  const restaurants = (result?.restaurants || []).slice(0, 6);
  const activities = (result?.activities || []).slice(0, 6);
  const singles = planType === "restaurant" ? restaurants : planType === "activity" ? activities : [];
  const hasResults = planType === "outing" ? recommended.length > 0 : singles.length > 0;
  const canBuild = restaurants.length > 0 && activities.length > 0;

  const customPair: MobileOutingResult | null = selectedRestaurant && selectedActivity ? {
    id: `custom-${selectedRestaurant.id}-${selectedActivity.id}`,
    restaurant: selectedRestaurant,
    activity: selectedActivity,
    distanceMiles: null,
    walkMinutes: null,
    reason: `${selectedRestaurant.name} and ${selectedActivity.name} make a smooth dinner-and-activity pairing for the night you described.`,
    resultType: "pair",
  } : null;

  const beforeTitle = <JourneySteps activeStep={3} />;

  if (loading) {
    return (
      <FoundationScreen
        eyebrow="STEP 3 OF 4 · PICK"
        title={headingFor(planType)}
        description="Compare the atmosphere, location and experience at a glance. Your strongest match is always shown first."
        beforeTitle={beforeTitle}
        showBrandHeader
        showBack
        backLabel="Adjust plan"
      >
        <SearchLoadingJourney planType={planType} />
      </FoundationScreen>
    );
  }

  if (error) {
    return (
      <FoundationScreen
        eyebrow="STEP 3 OF 4 · PICK"
        title={headingFor(planType)}
        description="Compare the atmosphere, location and experience at a glance. Your strongest match is always shown first."
        beforeTitle={beforeTitle}
        showBrandHeader
        showBack
        backLabel="Adjust plan"
      >
        <Card elevated>
          <AppText variant="h2">We couldn’t load your picks.</AppText>
          <AppText muted style={{ marginTop: 8 }}>{error}</AppText>
          <View style={{ marginTop: theme.spacing.lg }}>
            <Button onPress={() => void runSearch()}>Try again</Button>
          </View>
        </Card>
      </FoundationScreen>
    );
  }

  return (
    <FoundationScreen
      eyebrow="STEP 3 OF 4 · PICK"
      title={headingFor(planType)}
      description="Compare the atmosphere, location and experience at a glance. Your strongest match is always shown first."
      beforeTitle={beforeTitle}
      showBrandHeader
      showBack
      backLabel="Adjust plan"
    >
      <View style={{ gap: theme.spacing.lg }}>
        {!hasResults ? (
          <Card elevated>
            <AppText variant="h2">No strong picks yet.</AppText>
            <AppText muted style={{ marginTop: 8 }}>Adjust the area or preferences and we’ll try again.</AppText>
            <View style={{ marginTop: theme.spacing.lg }}>
              <Button onPress={() => router.back()}>Adjust my plan</Button>
            </View>
          </Card>
        ) : planType === "outing" ? (
          <>
            <View style={{ gap: theme.spacing.md }}>
              {recommended.map((outing, index) => <OutingResultCard key={outing.id} outing={outing} rank={index + 1} />)}
            </View>

            {canBuild ? (
              <Card elevated>
                <Pressable onPress={() => setShowBuilder((current) => !current)} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="eyebrow" muted>WANT MORE CONTROL?</AppText>
                      <AppText variant="h2" style={{ marginTop: 5 }}>Build your own outing</AppText>
                      <AppText muted style={{ marginTop: 5 }}>Choose one restaurant and one activity from these same results.</AppText>
                    </View>
                    <AppText variant="h2" muted>{showBuilder ? "−" : "+"}</AppText>
                  </View>
                </Pressable>

                {showBuilder ? (
                  <View style={{ gap: theme.spacing.lg, marginTop: theme.spacing.lg }}>
                    <View style={{ gap: theme.spacing.sm }}>
                      <AppText variant="eyebrow" accent>RESTAURANT</AppText>
                      {restaurants.map((place) => (
                        <PlaceResultCard
                          key={`restaurant-${place.id}`}
                          place={place}
                          actionLabel="Select"
                          selected={selectedRestaurant?.id === place.id}
                          onAction={() => setSelectedRestaurant(place)}
                        />
                      ))}
                    </View>

                    <View style={{ gap: theme.spacing.sm }}>
                      <AppText variant="eyebrow" accent>ACTIVITY</AppText>
                      {activities.map((place) => (
                        <PlaceResultCard
                          key={`activity-${place.id}`}
                          place={place}
                          actionLabel="Select"
                          selected={selectedActivity?.id === place.id}
                          onAction={() => setSelectedActivity(place)}
                        />
                      ))}
                    </View>

                    <Card style={{ backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accentBorder }}>
                      <AppText muted>{selectedRestaurant && selectedActivity ? `${selectedRestaurant.name} + ${selectedActivity.name}` : "Choose one restaurant and one activity."}</AppText>
                      <View style={{ marginTop: theme.spacing.md }}>
                        <Button disabled={!customPair} onPress={() => customPair && router.push(outingRouteParams(customPair))}>Choose my outing →</Button>
                      </View>
                    </Card>
                  </View>
                ) : null}
              </Card>
            ) : null}
          </>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {singles.map((place, index) => <PlaceResultCard key={`${place.id}-${index}`} place={place} />)}
          </View>
        )}
      </View>
    </FoundationScreen>
  );
}