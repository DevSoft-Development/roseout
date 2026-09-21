import type { Metadata } from "next";
import ReserveLobbyDisplay from "@/components/reserve/ReserveLobbyDisplay";

export const metadata: Metadata = {
  title: "Lobby Display | TheOutHaven Reserve",
  description: "Guest-safe live reservation and waitlist display.",
};

export const dynamic = "force-dynamic";

export default function ReserveLobbyDisplayPage() {
  return <ReserveLobbyDisplay />;
}
