import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { JourneySteps } from "@/components/planner/JourneySteps";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SearchLoadingJourney } from "@/components/search/SearchLoadingJourney";
import { OutingResultCard, PlaceResultCard } from "@/components/search/SearchResultCards";
import { mobileApi, MobileApiError } from "@/lib/api";
import { outingRouteParams } from "@/lib/result-navigation";
import type { MobileOutingResult, MobilePlaceResult, MobileSearchResponse } from "@/lib/search-results";
import { useAppTheme } from "@/providers/ThemeProvider";

type ResultsMode = "recommended" | "build" | "places";

function parseArray(raw: string | undefined) {
  if (!raw) return [] as string[];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export default function ResultsScreen() {
  const params = useLocalSearchParams<Record<string, string | undefined>>();
  const router = useRouter();
  const { theme } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<MobileSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ResultsMode>("recommended");
  const [selectedRestaurant, setSelectedRestaurant] = useState<MobilePlaceResult | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<MobilePlaceResult | null>(null);

  const requestBody = useMemo(() => ({
    query: params.query || "",
    planType: params.planType || "outing",
    when: params.when || "none",
    customDate: params.customDate || "",
    customTime: params.customTime || "",
    area: params.area || "Near me",
    partySize: params.partySize || "2",
    budget: params.budget || "$$",
    travel: params.travel || "nearby",
    preferences: parseArray(params.preferences),
    customMatters: parseArray(params.customMatters),
  }), [params]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await mobileApi<MobileSearchResponse>("/search", { method: "POST", body: JSON.stringify(requestBody) });
      setResult(response);
      const hasPairs = response.pairs.length > 0 || response.sameVenueResults.length > 0;
      if (!hasPairs && requestBody.planType !== "outing") setMode("places");
      else if (!hasPairs) setMode("build");
      else setMode("recommended");
    } catch (searchError) {
      setResult(null);
      setError(searchError instanceof MobileApiError ? searchError.message : "TheOutHaven could not complete that search. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [requestBody]);

  useEffect(() => { void runSearch(); }, [runSearch]);

  const recommended = [...(result?.pairs || []), ...(result?.sameVenueResults || [])];
  const restaurants = result?.restaurants || [];
  const activities = result?.activities || [];
  const singlePlaces = requestBody.planType === "restaurant" ? restaurants : requestBody.planType === "activity" ? activities : [...restaurants, ...activities];
  const customPair: MobileOutingResult | null = selectedRestaurant && selectedActivity ? {
    id: `custom-${selectedRestaurant.id}-${selectedActivity.id}`,
    restaurant: selectedRestaurant,
    activity: selectedActivity,
    distanceMiles: null,
    walkMinutes: null,
    reason: "Your custom restaurant + activity combination.",
    resultType: "pair",
  } : null;

  if (loading) {
    return (
      <FoundationScreen title="Finding your strongest picks" description="We’re matching fit, distance, ratings, availability signals, and your preferences.">
        <View style={{ gap: theme.spacing.lg }}>
          <BrandHeader compact />
          <JourneySteps activeStep={3} />
          <SearchLoadingJourney />
        </View>
      </FoundationScreen>
    );
  }

  if (error) {
    return (
      <FoundationScreen title="We hit a snag" description={error}>
        <View style={{ gap: theme.spacing.md }}>
          <BrandHeader compact />
          <JourneySteps activeStep={3} />
          <Button variant="ghost" fullWidth={false} onPress={() => router.back()}>← Back to Make It Yours</Button>
          <Button onPress={() => void runSearch()}>Try again</Button>
        </View>
      </FoundationScreen>
    );
  }

  return (
    <FoundationScreen title={requestBody.planType === "outing" ? "Your strongest OUTings" : "Your strongest picks"} description={result?.reply || "Ranked for the plan you asked for."}>
      <View style={{ gap: theme.spacing.lg }}>
        <BrandHeader compact />
        <JourneySteps activeStep={3} />
        <Button variant="ghost" fullWidth={false} onPress={() => router.back()}>← Edit Make It Yours</Button>

        <Card>
          <AppText variant="eyebrow" accent>YOUR SEARCH</AppText>
          <AppText variant="bodyStrong" style={{ marginTop: 6 }}>{requestBody.query}</AppText>
          <AppText variant="caption" muted style={{ marginTop: 4 }}>{requestBody.area} · {requestBody.when === "none" ? "Flexible time" : requestBody.when}</AppText>
        </Card>

        {requestBody.planType === "outing" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip label="Recommended pairs" selected={mode === "recommended"} disabled={!recommended.length} onPress={() => setMode("recommended")} />
            <Chip label="Build your own" selected={mode === "build"} disabled={!restaurants.length || !activities.length} onPress={() => setMode("build")} />
            <Chip label="All places" selected={mode === "places"} disabled={!singlePlaces.length} onPress={() => setMode("places")} />
          </View>
        ) : null}

        {mode === "recommended" && recommended.length ? (
          <View style={{ gap: theme.spacing.md }}>
            {recommended.map((outing, index) => <OutingResultCard key={outing.id} outing={outing} rank={index + 1} />)}
          </View>
        ) : null}

        {mode === "build" ? (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: theme.spacing.sm }}>
              <AppText variant="h2">Build your own OUTing</AppText>
              <AppText muted>Choose one restaurant and one activity from this same result set. Your search stays intact.</AppText>
            </View>

            <View style={{ gap: theme.spacing.md }}>
              <AppText variant="h3">1. Pick a restaurant</AppText>
              {restaurants.map((place) => (
                <PlaceResultCard
                  key={place.id}
                  place={place}
                  actionLabel="Use this restaurant"
                  selected={selectedRestaurant?.id === place.id}
                  onAction={() => setSelectedRestaurant(place)}
                />
              ))}
            </View>

            <View style={{ gap: theme.spacing.md }}>
              <AppText variant="h3">2. Pick an activity</AppText>
              {activities.map((place) => (
                <PlaceResultCard
                  key={place.id}
                  place={place}
                  actionLabel="Use this activity"
                  selected={selectedActivity?.id === place.id}
                  onAction={() => setSelectedActivity(place)}
                />
              ))}
            </View>

            {customPair ? (
              <Card elevated>
                <View style={{ gap: theme.spacing.md }}>
                  <AppText variant="eyebrow" accent>YOUR CUSTOM OUTING</AppText>
                  <AppText variant="h3">{selectedRestaurant?.name} + {selectedActivity?.name}</AppText>
                  <AppText muted>You can continue with this combination without restarting your search.</AppText>
                  <Button onPress={() => router.push(outingRouteParams(customPair))}>Choose this OUTing →</Button>
                </View>
              </Card>
            ) : null}
          </View>
        ) : null}

        {mode === "places" || requestBody.planType !== "outing" ? (
          <View style={{ gap: theme.spacing.md }}>
            {singlePlaces.map((place) => <PlaceResultCard key={`${place.kind}-${place.id}`} place={place} />)}
          </View>
        ) : null}

        {!recommended.length && !singlePlaces.length ? (
          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="h2">No strong match yet</AppText>
            <AppText muted>Try a nearby area or loosen one preference, then run the search again.</AppText>
          </View>
        ) : null}
      </View>
    </FoundationScreen>
  );
}
