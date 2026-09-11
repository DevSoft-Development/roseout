import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Card";
import { useAppTheme } from "@/providers/ThemeProvider";

type PlanType = "outing" | "restaurant" | "activity";

const LOADING_LINES: Record<PlanType, string[]> = {
  outing: [
    "Finding your perfect outing...",
    "Matching restaurants and activities...",
    "Checking distance, ratings, and fit...",
    "Building your strongest complete picks...",
  ],
  restaurant: [
    "Finding your perfect restaurant...",
    "Matching the food, vibe, and area...",
    "Checking ratings and fit...",
  ],
  activity: [
    "Finding your perfect activity...",
    "Matching the vibe, area, and experience...",
    "Checking ratings and fit...",
  ],
};

export function SearchLoadingJourney({ planType = "outing" }: { planType?: PlanType }) {
  const { theme } = useAppTheme();
  const [index, setIndex] = useState(0);
  const pulse = useRef(new Animated.Value(0.38)).current;
  const translate = useRef(new Animated.Value(-100)).current;
  const messages = LOADING_LINES[planType];

  useEffect(() => {
    setIndex(0);
    const timer = setInterval(() => setIndex((value) => (value + 1) % messages.length), 1800);
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.82, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.38, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(translate, { toValue: 260, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(translate, { toValue: -100, duration: 1, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => {
      clearInterval(timer);
      loop.stop();
    };
  }, [messages, pulse, translate]);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: 7 }}>
        <AppText variant="eyebrow" accent>THEOUTHAVEN IS SEARCHING</AppText>
        <AppText variant="h2">{messages[index % messages.length]}</AppText>
      </View>

      {[0, 1, 2, 3].map((item) => (
        <Card key={item} elevated style={{ minHeight: 190, overflow: "hidden", padding: 0 }}>
          <Animated.View style={{ opacity: pulse }}>
            <View style={{ height: 104, backgroundColor: theme.colors.borderStrong }} />
            <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
              <View style={{ height: 13, width: "31%", borderRadius: 999, backgroundColor: theme.colors.accentSoft }} />
              <View style={{ height: 19, width: "68%", borderRadius: 8, backgroundColor: theme.colors.borderStrong }} />
              <View style={{ height: 13, width: "82%", borderRadius: 8, backgroundColor: theme.colors.border }} />
              <View style={{ height: 13, width: "55%", borderRadius: 8, backgroundColor: theme.colors.border }} />
            </View>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: 80,
              backgroundColor: "rgba(255,255,255,0.055)",
              transform: [{ translateX: translate }],
            }}
          />
        </Card>
      ))}
    </View>
  );
}