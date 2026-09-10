import { useEffect, useMemo, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BrandHeader } from "@/components/brand/BrandHeader";
import { JourneySteps } from "@/components/planner/JourneySteps";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import { mobileApi, MobileApiError } from "@/lib/api";
import {
  DEFAULT_MOBILE_SEARCH_DRAFT,
  serializeSearchDraft,
  type MobilePlanType,
  type MobileSearchDraft,
} from "@/lib/search-draft";
import { useAppTheme } from "@/providers/ThemeProvider";

const WHEN_OPTIONS: Array<[MobileSearchDraft["when"], string]> = [
  ["today", "Today"],
  ["tonight", "Tonight"],
  ["tomorrow", "Tomorrow"],
  ["weekend", "This weekend"],
  ["none", "No specific time"],
];
const PARTY_OPTIONS: MobileSearchDraft["partySize"][] = ["1", "2", "3-4", "5-8", "9+"];
const BUDGET_OPTIONS: MobileSearchDraft["budget"][] = ["$", "$$", "$$$", "$$$$"];
const PREFERENCES = ["Romantic", "Upscale", "Lively", "Walking distance", "Budget friendly"];
const TRAVEL_OPTIONS: Array<[MobileSearchDraft["travel"], string]> = [
  ["walking", "Walking"],
  ["nearby", "Nearby"],
  ["reasonable", "Any reasonable distance"],
];

type PlannerIntentResponse = {
  ok: true;
  detectedLocation: { area: string; geoType: string; requestedMarket: string | null } | null;
};

export default function PlanScreen() {
  const params = useLocalSearchParams<{ prompt?: string; planType?: string; startAt?: string }>();
  const router = useRouter();
  const { theme } = useAppTheme();
  const incomingPrompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
  const incomingPlanType: MobilePlanType = params.planType === "restaurant" || params.planType === "activity" ? params.planType : "outing";
  const [resolvingIntent, setResolvingIntent] = useState(Boolean(incomingPrompt));
  const [error, setError] = useState<string | null>(null);
  const detectedForPrompt = useRef<string | null>(null);
  const [customMatter, setCustomMatter] = useState("");
  const [draft, setDraft] = useState<MobileSearchDraft>({
    ...DEFAULT_MOBILE_SEARCH_DRAFT,
    query: incomingPrompt,
    planType: incomingPlanType,
  });

  const summary = useMemo(() => serializeSearchDraft(draft), [draft]);
  const set = <K extends keyof MobileSearchDraft>(key: K, value: MobileSearchDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!incomingPrompt || detectedForPrompt.current === incomingPrompt) {
      setResolvingIntent(false);
      return;
    }
    detectedForPrompt.current = incomingPrompt;
    setDraft((current) => ({ ...current, query: incomingPrompt, planType: incomingPlanType }));
    setResolvingIntent(true);
    setError(null);

    void mobileApi<PlannerIntentResponse>("/search/intent", {
      method: "POST",
      body: JSON.stringify({ query: incomingPrompt }),
    })
      .then((response) => {
        const area = response.detectedLocation?.area?.trim();
        setDraft((current) => area
          ? { ...current, area, areaSource: "search" }
          : current.areaSource === "search"
            ? { ...current, area: "Near me", areaSource: "default" }
            : current,
        );
      })
      .catch((intentError) => {
        setError(intentError instanceof MobileApiError ? intentError.message : "We could not automatically read the location. You can enter it below.");
      })
      .finally(() => setResolvingIntent(false));
  }, [incomingPlanType, incomingPrompt]);

  function togglePreference(value: string) {
    setDraft((current) => ({
      ...current,
      preferences: current.preferences.includes(value)
        ? current.preferences.filter((item) => item !== value)
        : [...current.preferences, value],
      travel: value === "Walking distance" ? "walking" : current.travel,
    }));
  }

  function addCustomMatter() {
    const value = customMatter.trim();
    if (!value || draft.customMatters.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setDraft((current) => ({ ...current, customMatters: [...current.customMatters, value].slice(0, 5) }));
    setCustomMatter("");
  }

  function submit() {
    if (!summary.query) return;
    router.push({
      pathname: "/(tabs)/results",
      params: {
        query: summary.query,
        planType: summary.planType,
        when: summary.when,
        customDate: summary.customDate,
        customTime: summary.customTime,
        area: summary.area,
        areaSource: summary.areaSource,
        partySize: summary.partySize,
        budget: summary.budget,
        travel: summary.travel,
        preferences: JSON.stringify(summary.preferences),
        customMatters: JSON.stringify(summary.customMatters),
      },
    });
  }

  return (
    <FoundationScreen title="Make it yours" description="Confirm the details that matter. We’ll use the same planning logic as TheOutHaven on the web.">
      <View style={{ gap: theme.spacing.lg }}>
        <BrandHeader compact />
        <JourneySteps activeStep={2} />
        <Button variant="ghost" fullWidth={false} onPress={() => router.back()}>← Back</Button>

        <Card elevated>
          <AppText variant="eyebrow" accent>YOUR PLAN</AppText>
          <AppText variant="bodyStrong" style={{ marginTop: 8 }}>{draft.query || "Tell us what you want to do"}</AppText>
          <AppText variant="caption" muted style={{ marginTop: 6 }}>{draft.planType === "outing" ? "Restaurant + Activity" : draft.planType === "restaurant" ? "Restaurant" : "Activity"}</AppText>
        </Card>

        <View>
          <AppText variant="h3">Where?</AppText>
          <SearchField
            value={draft.area}
            onChangeText={(value) => setDraft((current) => ({ ...current, area: value, areaSource: "manual" }))}
            placeholder="Near me, Astoria, Brooklyn..."
            style={{ marginTop: theme.spacing.sm }}
          />
          <AppText variant="caption" muted style={{ marginTop: theme.spacing.xs }}>
            {resolvingIntent ? "Reading the location from your plan..." : draft.areaSource === "search" ? "Detected from your search." : "If you did not name an area, Near me is used."}
          </AppText>
        </View>

        <View>
          <AppText variant="h3">When?</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.sm }}>
            {WHEN_OPTIONS.map(([value, label]) => <Chip key={value} label={label} selected={draft.when === value} onPress={() => set("when", value)} />)}
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: theme.spacing.sm }}>
            <TextInput
              value={draft.customDate}
              onChangeText={(value) => set("customDate", value)}
              placeholder="Exact date (YYYY-MM-DD)"
              placeholderTextColor={theme.colors.textMuted}
              style={{ flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, borderColor: theme.colors.borderStrong, color: theme.colors.text, backgroundColor: theme.colors.surface }}
            />
            <TextInput
              value={draft.customTime}
              onChangeText={(value) => set("customTime", value)}
              placeholder="Time"
              placeholderTextColor={theme.colors.textMuted}
              style={{ width: 105, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, borderColor: theme.colors.borderStrong, color: theme.colors.text, backgroundColor: theme.colors.surface }}
            />
          </View>
        </View>

        <View>
          <AppText variant="h3">What matters?</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.sm }}>
            {PREFERENCES.map((value) => <Chip key={value} label={value} selected={draft.preferences.includes(value)} onPress={() => togglePreference(value)} />)}
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: theme.spacing.sm }}>
            <TextInput
              value={customMatter}
              onChangeText={setCustomMatter}
              onSubmitEditing={addCustomMatter}
              placeholder="Add another preference"
              placeholderTextColor={theme.colors.textMuted}
              style={{ flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, borderColor: theme.colors.borderStrong, color: theme.colors.text, backgroundColor: theme.colors.surface }}
            />
            <Button fullWidth={false} variant="secondary" onPress={addCustomMatter}>Add</Button>
          </View>
          {draft.customMatters.length ? <AppText variant="caption" muted style={{ marginTop: 8 }}>{draft.customMatters.join(" · ")}</AppText> : null}
        </View>

        <View>
          <AppText variant="h3">Party size</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.sm }}>
            {PARTY_OPTIONS.map((value) => <Chip key={value} label={value} selected={draft.partySize === value} onPress={() => set("partySize", value)} />)}
          </View>
        </View>

        <View>
          <AppText variant="h3">Budget</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.sm }}>
            {BUDGET_OPTIONS.map((value) => <Chip key={value} label={value} selected={draft.budget === value} onPress={() => set("budget", value)} />)}
          </View>
        </View>

        <View>
          <AppText variant="h3">How close should the stops be?</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.sm }}>
            {TRAVEL_OPTIONS.map(([value, label]) => <Chip key={value} label={label} selected={draft.travel === value} onPress={() => set("travel", value)} />)}
          </View>
        </View>

        {error ? <AppText muted>{error}</AppText> : null}
        <Button onPress={submit} disabled={!summary.query || resolvingIntent}>Show my picks</Button>
      </View>
    </FoundationScreen>
  );
}
