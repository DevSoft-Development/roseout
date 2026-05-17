import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getPrimaryCategory } from "@/lib/locationFields";

function serverSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

type Props = {
  children: React.ReactNode;
  params: Promise<{ type: string; id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type, id } = await params;
  const sourceTable = type === "activities" || type === "activity" ? "activities" : "restaurants";
  const supabase = serverSupabase();

  let { data } = await supabase
    .from("locations")
    .select("*")
    .or(`id.eq.${id},and(source_table.eq.${sourceTable},source_id.eq.${id})`)
    .maybeSingle();

  if (!data) {
    const slugResult = await supabase
      .from("locations")
      .select("*")
      .eq("slug", id)
      .maybeSingle();
    data = slugResult.data;
  }

  if (!data) {
    return {
      title: "Location | TheOutHaven",
      description: "Explore premium restaurants, activities, and reservation-ready experiences on TheOutHaven.",
    };
  }

  const name = getLocationName(data, "TheOutHaven Location");
  const category = getPrimaryCategory(data);
  const city = data.city ? String(data.city) : "near you";
  const description = [
    category,
    city,
    data.description || data.primary_tag || "premium hospitality experience",
    data.reservation_enabled ? "reservations available" : "details and directions available",
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 155);
  const image = getLocationImage(data);

  return {
    title: `${name} | TheOutHaven`,
    description,
    openGraph: {
      title: `${name} | TheOutHaven`,
      description,
      images: image ? [{ url: image, alt: name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} | TheOutHaven`,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default function LocationDetailLayout({ children }: Props) {
  return children;
}
