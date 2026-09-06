import { useLocalSearchParams } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";

export default function ShortLinkEntryScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  return (
    <FoundationScreen
      eyebrow="SHARED OUTING"
      title="Opening TheOutHaven"
      description={
        code
          ? `Short link ${code} reached the native app. The mobile resolver will map this code to its outing, location, event, experience, or other destination.`
          : "This shared TheOutHaven link reached the native app."
      }
    />
  );
}
