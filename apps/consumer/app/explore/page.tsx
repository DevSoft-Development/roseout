import type { Metadata } from "next";
import DiscoverClient from "./DiscoverClient";
import { loadDiscoverSections } from "@/lib/discover";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Discover OUTings | TheOutHaven",
  description: "Browse curated outing ideas, trending areas, popular searches, featured places, and complete plans from TheOutHaven.",
};

export default async function ExplorePage() {
  const sections = await loadDiscoverSections();
  return <DiscoverClient sections={sections} />;
}
