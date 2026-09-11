import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Card";
import { useAppTheme } from "@/providers/ThemeProvider";

const MESSAGES = [
  "Finding your perfect OUTing...",
  "Matching the vibe you asked for...",
  "Checking restaurants and things to do...",
  "Comparing how the stops fit together...",
  "Ranking the strongest combinations...",
  "Almost ready...",
];

export function SearchLoadingJourney() {
  const { theme } = useAppTheme();
  const [index, setIndex] = useState(0);
  const pulse = useRef(new Animated.Value(0.38)).current;
  const translate = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    const timer = setInterval(() => setIndex((value) => (value + 1) % MESSAGES.length), 1500);
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
  }, [pulse, translate]);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: 7 }}>
        <AppText variant="eyebrow" accent>BUILDING YOUR OUTING</AppText>
        <AppText variant="h2">{MESSAGES[index]}</AppText>
        <AppText muted>We’re ranking complete combinations first so you spend less time comparing tabs and more time choosing.</AppText>
      </View>

      {[0, 1, 2].map((item) => (
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
