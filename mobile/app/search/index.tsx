import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Card";
import { useAppTheme } from "@/providers/ThemeProvider";

export default function SearchHandoffScreen() {
  const params = useLocalSearchParams<{
    query?: string;
    when?: string;
    area?: string;
    partySize?: string;
    budget?: string;
    travel?: string;
  }>();
  const { theme } = useAppTheme();

  return (
    <FoundationScreen
      eyebrow="PICK"
      title="Finding your OUTing"
      description="Your preferences are ready for the existing TheOutHaven search engine. PR 7 will wire this route to the server-owned search endpoint and native results."
    >
      <Card elevated>
        <AppText variant="eyebrow" accent>SEARCH REQUEST</AppText>
        <AppText variant="h3" style={{ marginTop: theme.spacing.sm }}>{params.query || "OUTing"}</AppText>
        <View style={{ marginTop: theme.spacing.sm, gap: 4 }}>
          <AppText muted>When: {params.when || "tonight"}</AppText>
          <AppText muted>Where: {params.area || "Near me"}</AppText>
          <AppText muted>Party: {params.partySize || "2"}</AppText>
          <AppText muted>Budget: {params.budget || "$$"}</AppText>
          <AppText muted>Travel: {params.travel || "nearby"}</AppText>
        </View>
      </Card>
    </FoundationScreen>
  );
}
