import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Card";
import { useAppTheme } from "@/providers/ThemeProvider";

const MESSAGES = [
  "Finding your perfect OUTing...",
  "Looking for places that match your vibe...",
  "Checking restaurants and things to do...",
  "Comparing distance between your stops...",
  "Ranking the best combinations...",
  "Almost ready...",
];

export function SearchLoadingJourney() {
  const { theme } = useAppTheme();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((value) => (value + 1) % MESSAGES.length), 1600);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <AppText variant="h2">{MESSAGES[index]}</AppText>
      <AppText muted>TheOutHaven is building the strongest match from the same search engine used on the web.</AppText>
      {[0, 1, 2].map((item) => (
        <Card key={item} elevated style={{ minHeight: 132, overflow: "hidden" }}>
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ height: 18, width: "48%", borderRadius: 8, backgroundColor: theme.colors.borderStrong }} />
            <View style={{ height: 14, width: "74%", borderRadius: 8, backgroundColor: theme.colors.border }} />
            <View style={{ height: 14, width: "58%", borderRadius: 8, backgroundColor: theme.colors.border }} />
            <View style={{ height: 36, marginTop: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.accentSoft }} />
          </View>
        </Card>
      ))}
    </View>
  );
}
