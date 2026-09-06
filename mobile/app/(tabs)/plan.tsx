import { useLocalSearchParams } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";
import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Card";

export default function PlanScreen() {
  const params = useLocalSearchParams<{ prompt?: string }>();
  const prompt = typeof params.prompt === "string" ? params.prompt.trim() : "";

  return (
    <FoundationScreen
      eyebrow="PLAN"
      title="Plan your next OUTing"
      description="This is the native entry point for PLAN → MAKE IT YOURS → PICK → COMPLETE OUTING."
    >
      {prompt ? (
        <Card elevated>
          <AppText variant="eyebrow" accent>STARTING WITH</AppText>
          <AppText variant="h3" style={{ marginTop: 8 }}>{prompt}</AppText>
          <AppText muted style={{ marginTop: 6 }}>
            The guided search flow will continue from this intent without making you start over.
          </AppText>
        </Card>
      ) : null}
    </FoundationScreen>
  );
}
