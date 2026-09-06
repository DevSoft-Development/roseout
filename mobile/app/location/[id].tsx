import { useLocalSearchParams } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";

export default function LocationDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  return (
    <FoundationScreen
      eyebrow="LOCATION"
      title="Location detail"
      description={id ? `Native location route ready for ${id}.` : "Native location route ready."}
    />
  );
}
