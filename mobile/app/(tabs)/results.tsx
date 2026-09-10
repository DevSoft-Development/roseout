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
    reason: "Built by you from this search. TheOutHaven keeps the same plan and preferences intact.",
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
      <FoundationScreen title="We couldn’t finish that search" description="Your plan is still here. Try again, or go back and adjust one detail.">
        <View style={{ gap: theme.spacing.lg }}>
          <BrandHeader compact />
          <JourneySteps activeStep={3} />
          <Card elevated>
            <AppText variant="eyebrow" accent>SEARCH PAUSED</AppText>
            <AppText variant="h3" style={{ marginTop: 8 }}>Nothing was lost</AppText>
            <AppText muted style={{ marginTop: 8 }}>{error}</AppText>
            <View style={{ gap: 10, marginTop: theme.spacing.lg }}>
              <Button onPress={() => void runSearch()}>Try again</Button>
              <Button variant="secondary" onPress={() => router.back()}>Edit Make It Yours</Button>
            </View>
          </Card>
        </View>
      </FoundationScreen>
    );
  }

  const hasAnyResults = recommended.length > 0 || singlePlaces.length > 0;

  return (
    <FoundationScreen title={requestBody.planType === "outing" ? "Pick your OUTing" : "Pick your place"} description={result?.reply || "Ranked for the plan you asked for."}>
      <View style={{ gap: theme.spacing.lg }}>
        <BrandHeader compact />
        <JourneySteps activeStep={3} />
        <Button variant="ghost" fullWidth={false} onPress={() => router.back()}>← Edit Make It Yours</Button>

        <Card elevated>
          <AppText variant="eyebrow" accent>YOUR PLAN</AppText>
          <AppText variant="h3" style={{ marginTop: 8 }}>{requestBody.query}</AppText>
          <AppText variant="caption" muted style={{ marginTop: 6 }}>
            {requestBody.area} · {requestBody.when === "none" ? "Flexible time" : requestBody.when} · Party {requestBody.partySize} · {requestBody.budget}
          </AppText>
        </Card>

        {requestBody.planType === "outing" && hasAnyResults ? (
          <Card>
            <AppText variant="eyebrow" accent>HOW DO YOU WANT TO PICK?</AppText>
            <AppText muted style={{ marginTop: 6 }}>Start with TheOutHaven’s strongest pairs, or build the combination yourself.</AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.md }}>
              <Chip label={`Recommended${recommended.length ? ` · ${recommended.length}` : ""}`} selected={mode === "recommended"} disabled={!recommended.length} onPress={() => setMode("recommended")} />
              <Chip label="Build your own" selected={mode === "build"} disabled={!restaurants.length || !activities.length} onPress={() => setMode("build")} />
              <Chip label={`All places${singlePlaces.length ? ` · ${singlePlaces.length}` : ""}`} selected={mode === "places"} disabled={!singlePlaces.length} onPress={() => setMode("places")} />
            </View>
          </Card>
        ) : null}

        {mode === "recommended" && recommended.length ? (
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ gap: 5 }}>
              <AppText variant="eyebrow" accent>RECOMMENDED OUTINGS</AppText>
              <AppText variant="h2">Built to work together</AppText>
              <AppText muted>Complete restaurant + activity combinations, ranked for your plan.</AppText>
            </View>
            {recommended.map((outing, index) => <OutingResultCard key={outing.id} outing={outing} rank={index + 1} />)}
          </View>
        ) : null}

        {mode === "build" ? (
          <View style={{ gap: theme.spacing.lg }}>
            <Card elevated>
              <AppText variant="eyebrow" accent>BUILD YOUR OWN OUTING</AppText>
              <AppText variant="h2" style={{ marginTop: 8 }}>You choose both stops.</AppText>
              <AppText muted style={{ marginTop: 8 }}>Pick a restaurant and an activity from the same search. We keep your location, timing, budget, and preferences in place.</AppText>

              <View style={{ gap: 10, marginTop: theme.spacing.lg }}>
                <View style={{ borderWidth: 1, borderColor: selectedRestaurant ? theme.colors.accent : theme.colors.border, backgroundColor: selectedRestaurant ? theme.colors.accentSoft : theme.colors.surface, borderRadius: 18, padding: 14 }}>
                  <AppText variant="caption" accent>1 · RESTAURANT</AppText>
                  <AppText variant="bodyStrong" style={{ marginTop: 4 }}>{selectedRestaurant?.name || "Choose your dinner stop"}</AppText>
                </View>
                <View style={{ borderWidth: 1, borderColor: selectedActivity ? theme.colors.accent : theme.colors.border, backgroundColor: selectedActivity ? theme.colors.accentSoft : theme.colors.surface, borderRadius: 18, padding: 14 }}>
                  <AppText variant="caption" accent>2 · ACTIVITY</AppText>
                  <AppText variant="bodyStrong" style={{ marginTop: 4 }}>{selectedActivity?.name || "Choose what happens next"}</AppText>
                </View>
              </View>

              {customPair ? (
                <View style={{ marginTop: theme.spacing.lg }}>
                  <Button onPress={() => router.push(outingRouteParams(customPair))}>Continue with this OUTing →</Button>
                </View>
              ) : null}
            </Card>

            <View style={{ gap: theme.spacing.md }}>
              <View style={{ gap: 4 }}>
                <AppText variant="h2">1. Pick a restaurant</AppText>
                <AppText muted>{selectedRestaurant ? "Restaurant selected. Change it anytime." : "Choose the first stop for your OUTing."}</AppText>
              </View>
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
              <View style={{ gap: 4 }}>
                <AppText variant="h2">2. Pick an activity</AppText>
                <AppText muted>{selectedActivity ? "Activity selected. Your custom OUTing is ready." : "Now choose what you want to do next."}</AppText>
              </View>
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
          </View>
        ) : null}

        {mode === "places" || requestBody.planType !== "outing" ? (
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ gap: 5 }}>
              <AppText variant="eyebrow" accent>{requestBody.planType === "outing" ? "ALL MATCHES" : "BEST MATCHES"}</AppText>
              <AppText variant="h2">Explore the individual places</AppText>
            </View>
            {singlePlaces.map((place) => <PlaceResultCard key={`${place.kind}-${place.id}`} place={place} />)}
          </View>
        ) : null}

        {!hasAnyResults ? (
          <Card elevated>
            <AppText variant="eyebrow" accent>NO STRONG MATCH YET</AppText>
            <AppText variant="h2" style={{ marginTop: 8 }}>Keep the plan. Loosen one thing.</AppText>
            <AppText muted style={{ marginTop: 8 }}>Try a nearby area, a wider travel range, or one fewer preference. You don’t need to start over.</AppText>
            <View style={{ gap: 10, marginTop: theme.spacing.lg }}>
              <Button onPress={() => router.back()}>Adjust my plan</Button>
              <Button variant="secondary" onPress={() => void runSearch()}>Search again</Button>
            </View>
          </Card>
        ) : null}
      </View>
    </FoundationScreen>
  );
}
