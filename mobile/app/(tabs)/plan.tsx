import { useEffect, useMemo, useRef, useState } from "react";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import * as Location from "expo-location";
import { Platform, Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  ["none", "Anytime"],
];

const PREFERENCES: Array<{ label: string; icon: string }> = [
  { label: "Romantic", icon: "♥" },
  { label: "Upscale", icon: "✦" },
  { label: "Lively", icon: "♫" },
  { label: "Walking distance", icon: "↗" },
  { label: "Budget friendly", icon: "$" },
];

type PlannerIntentResponse = {
  ok: true;
  detectedLocation: { area: string; geoType: string; requestedMarket: string | null } | null;
};

type ActivePicker = "date" | "time" | null;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateValue(value: string, fallback: Date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return fallback;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), fallback.getHours(), fallback.getMinutes());
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function withTimeValue(value: string, fallback: Date) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return fallback;
  const parsed = new Date(fallback);
  parsed.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function formatDateStorage(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function formatTimeStorage(value: Date) {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function formatDateLabel(value: string) {
  if (!value) return "Choose date";
  return toDateValue(value, new Date()).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeLabel(value: string) {
  if (!value) return "Choose time";
  return withTimeValue(value, new Date()).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return formatDateStorage(date);
}

function weekendDate() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const daysUntilSaturday = day === 6 ? 0 : day === 0 ? 6 : 6 - day;
  date.setDate(date.getDate() + daysUntilSaturday);
  return formatDateStorage(date);
}

export default function PlanScreen() {
  const params = useLocalSearchParams<{ prompt?: string; planType?: string; startAt?: string }>();
  const router = useRouter();
  const { theme } = useAppTheme();
  const incomingPrompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
  const incomingPlanType: MobilePlanType = params.planType === "restaurant" || params.planType === "activity" ? params.planType : "outing";
  const [resolvingIntent, setResolvingIntent] = useState(Boolean(incomingPrompt));
  const [requestingLocation, setRequestingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [showExactTiming, setShowExactTiming] = useState(false);
  const [showCustomPreference, setShowCustomPreference] = useState(false);
  const detectedForPrompt = useRef<string | null>(null);
  const [customMatter, setCustomMatter] = useState("");
  const [draft, setDraft] = useState<MobileSearchDraft>({
    ...DEFAULT_MOBILE_SEARCH_DRAFT,
    query: incomingPrompt,
    planType: incomingPlanType,
  });

  const summary = useMemo(() => serializeSearchDraft(draft), [draft]);

  const nativePickerValue = useMemo(() => {
    const now = new Date();
    const dated = toDateValue(draft.customDate, now);
    return withTimeValue(draft.customTime, dated);
  }, [draft.customDate, draft.customTime]);

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
          ? { ...current, area, areaSource: "search", latitude: null, longitude: null }
          : current.areaSource === "search"
            ? { ...current, area: "Near me", areaSource: "default", latitude: null, longitude: null }
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
    const value = customMatter.trim().replace(/[,;]+$/, "");
    if (!value || draft.customMatters.length >= 5 || draft.customMatters.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setCustomMatter("");
      return;
    }
    setDraft((current) => ({ ...current, customMatters: [...current.customMatters, value] }));
    setCustomMatter("");
  }

  function selectWhen(value: MobileSearchDraft["when"]) {
    setDraft((current) => {
      if (value === "today" || value === "tonight") return { ...current, when: value, customDate: localDate(0) };
      if (value === "tomorrow") return { ...current, when: value, customDate: localDate(1) };
      if (value === "weekend") return { ...current, when: value, customDate: weekendDate() };
      return { ...current, when: "none", customDate: "", customTime: "" };
    });
  }

  async function requestUserLocation() {
    setRequestingLocation(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setDraft((current) => ({ ...current, latitude: null, longitude: null, areaSource: current.areaSource === "device" ? "default" : current.areaSource }));
        setError("Location access is off. Enter a neighborhood, city, or ZIP instead.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDraft((current) => ({
        ...current,
        area: "Near me",
        areaSource: "device",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }));
    } catch {
      setError("We couldn’t get your current location. Enter a neighborhood, city, or ZIP instead.");
    } finally {
      setRequestingLocation(false);
    }
  }

  function applyNativeDate(selectedDate: Date) {
    if (activePicker === "date") {
      setDraft((current) => ({ ...current, when: "custom", customDate: formatDateStorage(selectedDate) }));
    } else if (activePicker === "time") {
      setDraft((current) => ({ ...current, when: "custom", customTime: formatTimeStorage(selectedDate) }));
    }
    if (Platform.OS === "android") setActivePicker(null);
  }

  function submit() {
    if (!summary.query) return;
    const hasTypedOrDetectedArea = (summary.areaSource === "search" || summary.areaSource === "manual") && Boolean(summary.area.trim()) && summary.area !== "Near me";
    const hasDeviceLocation = summary.areaSource === "device" && summary.latitude !== null && summary.longitude !== null;
    if (!hasTypedOrDetectedArea && !hasDeviceLocation) {
      setError("Add an area or use your current location so we know where to plan.");
      return;
    }

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
        latitude: summary.latitude == null ? "" : String(summary.latitude),
        longitude: summary.longitude == null ? "" : String(summary.longitude),
        partySize: summary.partySize,
        budget: summary.budget,
        travel: summary.travel,
        preferences: JSON.stringify(summary.preferences),
        customMatters: JSON.stringify(summary.customMatters),
      },
    });
  }

  const pickerFieldStyle = {
    flex: 1,
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    justifyContent: "center" as const,
  };

  const detectedFromSearch = draft.areaSource === "search" && Boolean(draft.area.trim()) && draft.area !== "Near me";
  const usingDeviceLocation = draft.areaSource === "device" && draft.latitude !== null && draft.longitude !== null;

  return (
    <FoundationScreen
      eyebrow="STEP 2 OF 4"
      title="Make it yours."
      description="Tell us where. Timing and preferences are optional."
      beforeTitle={<JourneySteps activeStep={2} />}
      showBrandHeader
      showBack
      backLabel="Back"
    >
      <View style={{ gap: theme.spacing.md }}>
        <Card elevated>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <AppText variant="eyebrow">WHERE?</AppText>
              <AppText variant="caption" muted style={{ marginTop: 4 }}>Required</AppText>
            </View>
            {detectedFromSearch ? (
              <View style={{ borderRadius: 999, backgroundColor: "rgba(52,211,153,0.10)", paddingHorizontal: 10, paddingVertical: 6 }}>
                <AppText variant="caption" style={{ color: "#6ee7b7" }}>From your search</AppText>
              </View>
            ) : null}
          </View>

          {detectedFromSearch ? (
            <View style={{ marginTop: 12, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderWidth: 1, borderColor: "rgba(52,211,153,0.20)", backgroundColor: "rgba(52,211,153,0.07)", borderRadius: 16, paddingHorizontal: 14 }}>
              <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{draft.area}</AppText>
              <Button fullWidth={false} variant="secondary" onPress={() => setDraft((current) => ({ ...current, areaSource: "manual", latitude: null, longitude: null }))}>Change</Button>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: theme.spacing.md }}>
              <View style={{ flex: 1 }}>
                <SearchField
                  value={draft.areaSource === "default" || usingDeviceLocation ? "" : draft.area}
                  onChangeText={(value) => setDraft((current) => ({
                    ...current,
                    area: value,
                    areaSource: value.trim() ? "manual" : "default",
                    latitude: null,
                    longitude: null,
                  }))}
                  placeholder="Neighborhood, city, or ZIP"
                />
              </View>
              <Button fullWidth={false} variant={usingDeviceLocation ? "secondary" : "secondary"} disabled={requestingLocation} onPress={() => void requestUserLocation()}>
                {requestingLocation ? "Locating…" : usingDeviceLocation ? "✓ My location" : "Use my location"}
              </Button>
            </View>
          )}
          {resolvingIntent ? <AppText variant="caption" muted style={{ marginTop: 8 }}>Reading the location from your plan...</AppText> : null}
        </Card>

        <Card elevated>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <AppText variant="eyebrow">WHEN?</AppText>
              <AppText variant="caption" muted style={{ marginTop: 4 }}>Optional — skip this if timing does not matter.</AppText>
            </View>
            {!showExactTiming ? (
              <Pressable onPress={() => setShowExactTiming(true)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, borderWidth: 1, borderColor: theme.colors.borderStrong, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 })}>
                <AppText variant="caption">Exact date & time</AppText>
              </Pressable>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.md }}>
            {WHEN_OPTIONS.map(([value, label]) => <Chip key={value} label={label} selected={draft.when === value && !showExactTiming} onPress={() => { selectWhen(value); setShowExactTiming(false); }} />)}
          </View>

          {showExactTiming ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: theme.spacing.md }}>
              {Platform.OS === "ios" ? (
                <>
                  <View style={pickerFieldStyle}>
                    <AppText variant="caption" muted>Date</AppText>
                    <DateTimePicker
                      value={nativePickerValue}
                      onValueChange={(_, selectedDate) => setDraft((current) => ({ ...current, when: "custom", customDate: formatDateStorage(selectedDate) }))}
                      mode="date"
                      display="compact"
                      minimumDate={new Date()}
                      accentColor={theme.colors.accent}
                      themeVariant="dark"
                      timeZoneName="America/New_York"
                      style={{ marginTop: 4 }}
                    />
                  </View>
                  <View style={pickerFieldStyle}>
                    <AppText variant="caption" muted>Time</AppText>
                    <DateTimePicker
                      value={nativePickerValue}
                      onValueChange={(_, selectedDate) => setDraft((current) => ({ ...current, when: "custom", customTime: formatTimeStorage(selectedDate) }))}
                      mode="time"
                      display="compact"
                      accentColor={theme.colors.accent}
                      themeVariant="dark"
                      timeZoneName="America/New_York"
                      style={{ marginTop: 4 }}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Pressable accessibilityRole="button" accessibilityLabel="Choose exact date" onPress={() => setActivePicker("date")} style={({ pressed }) => [pickerFieldStyle, pressed && { borderColor: theme.colors.accentBorder, backgroundColor: theme.colors.accentSoft }]}>
                    <AppText variant="caption" muted>Date</AppText>
                    <AppText variant="bodyStrong" style={{ marginTop: 2 }}>{formatDateLabel(draft.customDate)}</AppText>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Choose exact time" onPress={() => setActivePicker("time")} style={({ pressed }) => [pickerFieldStyle, pressed && { borderColor: theme.colors.accentBorder, backgroundColor: theme.colors.accentSoft }]}>
                    <AppText variant="caption" muted>Time</AppText>
                    <AppText variant="bodyStrong" style={{ marginTop: 2 }}>{formatTimeLabel(draft.customTime)}</AppText>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}

          {Platform.OS === "android" && activePicker ? (
            <DateTimePicker
              value={nativePickerValue}
              onValueChange={(_, selectedDate) => applyNativeDate(selectedDate)}
              onDismiss={() => setActivePicker(null)}
              mode={activePicker}
              presentation="dialog"
              minimumDate={activePicker === "date" ? new Date() : undefined}
              accentColor={theme.colors.accent}
              is24Hour={false}
            />
          ) : null}
        </Card>

        <Card elevated>
          <AppText variant="eyebrow">WHAT MATTERS?</AppText>
          <AppText variant="caption" muted style={{ marginTop: 4 }}>Optional — choose only what would actually change your picks.</AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: theme.spacing.md }}>
            {PREFERENCES.map((item) => <Chip key={item.label} label={`${item.icon} ${item.label}${draft.preferences.includes(item.label) ? " ✓" : ""}`} selected={draft.preferences.includes(item.label)} onPress={() => togglePreference(item.label)} />)}
          </View>

          {showCustomPreference || draft.customMatters.length > 0 ? (
            <View style={{ marginTop: theme.spacing.md, gap: 8 }}>
              {draft.customMatters.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {draft.customMatters.map((item) => (
                    <Pressable key={item} onPress={() => setDraft((current) => ({ ...current, customMatters: current.customMatters.filter((value) => value !== item) }))} style={{ borderWidth: 1, borderColor: theme.colors.accentBorder, backgroundColor: theme.colors.accentSoft, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 }}>
                      <AppText variant="caption">{item} ×</AppText>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <TextInput
                editable={draft.customMatters.length < 5}
                value={customMatter}
                onChangeText={(value) => setCustomMatter(value.replace(/^\s+/, ""))}
                onSubmitEditing={addCustomMatter}
                onBlur={() => customMatter.trim() && addCustomMatter()}
                placeholder={draft.customMatters.length >= 5 ? "5 custom preferences added" : "e.g. live music, quiet table, outdoor seating"}
                placeholderTextColor={theme.colors.textMuted}
                style={{ minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, borderColor: theme.colors.borderStrong, color: theme.colors.text, backgroundColor: theme.colors.background }}
              />
            </View>
          ) : (
            <Pressable onPress={() => setShowCustomPreference(true)} style={{ marginTop: theme.spacing.md }}>
              <AppText variant="bodyStrong" accent>+ Add something specific</AppText>
            </Pressable>
          )}
        </Card>

        {error ? <AppText style={{ color: "#fecaca" }}>{error}</AppText> : null}
        <Button onPress={submit} disabled={!summary.query || resolvingIntent || requestingLocation}>Show My Picks →</Button>
      </View>
    </FoundationScreen>
  );
}
