import { useLocalSearchParams } from "expo-router";
import { FoundationScreen } from "@/components/FoundationScreen";

export default function OutingDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  return (
    <FoundationScreen
      eyebrow="OUTING"
      title="Outing detail"
      description={id ? `Native outing route ready for ${id}.` : "Native outing route ready."}
    />
  );
}
