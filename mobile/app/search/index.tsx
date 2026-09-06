import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SearchLoadingJourney } from "@/components/search/SearchLoadingJourney";
import { OutingResultCard, PlaceResultCard } from "@/components/search/SearchResultCards";
import { mobileApi, MobileApiError } from "@/lib/api";
import type { MobileSearchResponse } from "@/lib/search-results";
import { useAppTheme } from "@/providers/ThemeProvider";

type Mode = "outings" | "places";

export default function SearchScreen() {
  const params = useLocalSearchParams<{
    query?: string;
    when?: string;
    area?: string;
    partySize?: string;
    budget?: string;
    travel?: string;
  }>();
  const { theme } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<MobileSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("outings");

  const requestBody = useMemo(
    () => ({
      query: params.query || "",
      when: params.when || "tonight",
      area: params.area || "Near me",
      partySize: params.partySize || "2",
      budget: params.budget || "$$",
      travel: params.travel || "nearby",
    }),
    [params.area, params.budget, params.partySize, params.query, params.travel, params.when],
  );

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await mobileApi<MobileSearchResponse>("/search", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });
      setResult(response);
      if (!response.pairs.length) setMode("places");
    } catch (searchError) {
      setResult(null);
      setError(
        searchError instanceof MobileApiError
          ? searchError.message
          : "TheOutHaven could not complete that search. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [requestBody]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  if (loading) {
    return (
      <FoundationScreen
        eyebrow="PICK"
        title="Finding your OUTing"
        description="We’re matching your plan against TheOutHaven’s live search catalog."
      >
        <SearchLoadingJourney />
      </FoundationScreen>
    );
  }

  if (error) {
    return (
      <FoundationScreen eyebrow="PICK" title="We hit a snag" description={error}>
        <Button onPress={() => void runSearch()}>Try again</Button>
      </FoundationScreen>
    );
  }

  const places = [...(result?.restaurants || []), ...(result?.activities || [])];
  const hasOutings = Boolean(result?.pairs.length);
  const hasPlaces = Boolean(places.length);

  return (
    <FoundationScreen
      eyebrow="PICK"
      title={hasOutings ? "Your OUTings" : "Places for you"}
      description={result?.reply || "Here are the strongest matches for what you asked for."}
    >
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <Chip label="OUTings" selected={mode === "outings"} disabled={!hasOutings} onPress={() => setMode("outings")} />
          <Chip label="Places" selected={mode === "places"} disabled={!hasPlaces} onPress={() => setMode("places")} />
        </View>

        {!hasOutings && !hasPlaces ? (
          <View style={{ gap: theme.spacing.md }}>
            <AppText variant="h2">No strong match yet</AppText>
            <AppText muted>Try a nearby area, a broader activity, or fewer restrictions.</AppText>
            <Button variant="secondary" onPress={() => void runSearch()}>Search again</Button>
          </View>
        ) : null}

        {mode === "outings" && hasOutings ? (
          <View style={{ gap: theme.spacing.md }}>
            {result?.pairs.map((outing) => <OutingResultCard key={outing.id} outing={outing} />)}
          </View>
        ) : null}

        {mode === "places" && hasPlaces ? (
          <View style={{ gap: theme.spacing.md }}>
            {places.map((place) => <PlaceResultCard key={`${place.kind}-${place.id}`} place={place} />)}
          </View>
        ) : null}
      </View>
    </FoundationScreen>
  );
}
