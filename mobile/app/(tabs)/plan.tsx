import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SearchField } from "@/components/ui/SearchField";
import {
  DEFAULT_MOBILE_SEARCH_DRAFT,
  serializeSearchDraft,
  type MobileSearchDraft,
} from "@/lib/search-draft";
import { useAppTheme } from "@/providers/ThemeProvider";

const WHEN_OPTIONS: Array<[MobileSearchDraft["when"], string]> = [
  ["now", "Now"],
  ["tonight", "Tonight"],
  ["tomorrow", "Tomorrow"],
  ["weekend", "This weekend"],
];
const PARTY_OPTIONS: MobileSearchDraft["partySize"][] = ["1", "2", "3-4", "5-8", "9+"];
const BUDGET_OPTIONS: MobileSearchDraft["budget"][] = ["$", "$$", "$$$", "$$$$"];
const TRAVEL_OPTIONS: Array<[MobileSearchDraft["travel"], string]> = [
  ["walking", "Walking"],
  ["nearby", "Nearby"],
  ["reasonable", "Any reasonable distance"],
];

export default function PlanScreen() {
  const params = useLocalSearchParams<{ prompt?: string }>();
  const router = useRouter();
  const { theme } = useAppTheme();
  const incomingPrompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
  const [draft, setDraft] = useState<MobileSearchDraft>({
    ...DEFAULT_MOBILE_SEARCH_DRAFT,
    query: incomingPrompt,
  });

  useEffect(() => {
    if (incomingPrompt) setDraft((current) => ({ ...current, query: incomingPrompt }));
  }, [incomingPrompt]);

  const canContinue = draft.query.trim().length >= 2;
  const summary = useMemo(() => serializeSearchDraft(draft), [draft]);
  const set = <K extends keyof MobileSearchDraft>(key: K, value: MobileSearchDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function submit() {
    if (!canContinue) return;
    router.push({
      pathname: "/search",
      params: {
        query: summary.query,
        when: summary.when,
        area: summary.area,
        partySize: summary.partySize,
        budget: summary.budget,
        travel: summary.travel,
      },
    });
  }

  return (
    <FoundationScreen
      eyebrow="PLAN"
      title="Plan your next OUTing"
      description="Tell us what you want, then add only the details that matter. The search engine handles the rest."
    >
      <View style={{ gap: theme.spacing.xl }}>
        <View>
          <AppText variant="eyebrow" accent>1 · PLAN</AppText>
          <AppText variant="h3" style={{ marginTop: theme.spacing.xs }}>What are we doing?</AppText>
          <SearchField
            value={draft.query}
            onChangeText={(value) => set("query", value)}
            placeholder="Seafood dinner and jazz in Brooklyn"
            returnKeyType="next"
            style={{ marginTop: theme.spacing.sm }}
          />
        </View>

        <View>
          <AppText variant="eyebrow" accent>2 · MAKE IT YOURS</AppText>
          <AppText variant="h3" style={{ marginTop: theme.spacing.xs }}>When?</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.sm }}>
            {WHEN_OPTIONS.map(([value, label]) => (
              <Chip key={value} label={label} selected={draft.when === value} onPress={() => set("when", value)} />
            ))}
          </View>
        </View>

        <View>
          <AppText variant="h3">Where?</AppText>
          <SearchField
            value={draft.area}
            onChangeText={(value) => set("area", value)}
            placeholder="Near me, Astoria, Brooklyn..."
            style={{ marginTop: theme.spacing.sm }}
          />
        </View>

        <View>
          <AppText variant="h3">Party size</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.sm }}>
            {PARTY_OPTIONS.map((value) => (
              <Chip key={value} label={value} selected={draft.partySize === value} onPress={() => set("partySize", value)} />
            ))}
          </View>
        </View>

        <View>
          <AppText variant="h3">Budget</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.sm }}>
            {BUDGET_OPTIONS.map((value) => (
              <Chip key={value} label={value} selected={draft.budget === value} onPress={() => set("budget", value)} />
            ))}
          </View>
        </View>

        <View>
          <AppText variant="h3">How close should the stops be?</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.sm }}>
            {TRAVEL_OPTIONS.map(([value, label]) => (
              <Chip key={value} label={label} selected={draft.travel === value} onPress={() => set("travel", value)} />
            ))}
          </View>
        </View>

        <Card elevated>
          <AppText variant="eyebrow" accent>READY TO SEARCH</AppText>
          <AppText variant="bodyStrong" style={{ marginTop: 8 }}>{summary.query || "Add what you want to do"}</AppText>
          <AppText muted style={{ marginTop: 6 }}>
            {summary.when} · {summary.area} · {summary.partySize} people · {summary.budget} · {summary.travel}
          </AppText>
        </Card>

        <Button onPress={submit} disabled={!canContinue}>Find my OUTing</Button>
      </View>
    </FoundationScreen>
  );
}
