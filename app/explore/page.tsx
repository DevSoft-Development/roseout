import type { Metadata } from "next";
import DiscoverClient from "./DiscoverClient";
import { loadDiscoverSections } from "@/lib/discover";
import { createClient } from "@/lib/supabase-server";
import { getConsumerHomeGeo } from "@/lib/geo/server";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Discover OUTings | TheOutHaven",
  description: "Browse curated outing ideas, trending areas, popular searches, featured places, and complete plans from TheOutHaven.",
};

export default async function ExplorePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const geo = user ? await getConsumerHomeGeo(user.id) : null;
  const sections = await loadDiscoverSections(geo);
  return <DiscoverClient sections={sections} />;
}
