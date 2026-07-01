import type { Metadata } from "next";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { getLocationName } from "@/lib/locationName";
import { getLocationImage } from "@/lib/locationImage";
import { getPrimaryCategory } from "@/lib/locationFields";
import { isPublicSearchVisible } from "@/lib/locationVisibility";
import {
  breadcrumbJsonLd,
  buildMetadata,
  canonicalUrl,
  jsonLdScript,
  localSeoDescription,
  openGraphImage,
} from "@/lib/seo";

function serverSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

type LocationRecord = Record<string, any>;

type Props = {
  children: React.ReactNode;
  params: Promise<{ type: string; locationId: string }>;
};

const loadLocation = cache(async (type: string, locationId: string) => {
  const sourceTables = type === "activities" || type === "activity"
    ? ["activities", "activity"]
    : ["restaurants", "restaurant"];
  const sourceOr = sourceTables
    .map((sourceTable) => `and(source_table.eq.${sourceTable},source_id.eq.${locationId})`)
    .join(",");
  const supabase = serverSupabase();

  let { data } = await supabase
    .from("locations")
    .select("*")
    .or(`id.eq.${locationId},${sourceOr}`)
    .maybeSingle();

  if (!data) {
    const slugResult = await supabase
      .from("locations")
      .select("*")
      .eq("slug", locationId)
      .maybeSingle();
    data = slugResult.data;
  }

  if (!data || !isPublicSearchVisible(data)) return null;

  return data as LocationRecord;
});

function locationPath(type: string, locationId: string) {
  return `/locations/${type}/${locationId}`;
}

function locationDescription(location: LocationRecord) {
  const name = getLocationName(location, "TheOutHaven location");
  const category = getPrimaryCategory(location);
  const area = [location.neighborhood, location.borough || location.city].filter(Boolean).join(", ");
  const detail = location.description || location.primary_tag || location.cuisine || location.activity_type;

  return localSeoDescription({
    area: area || location.city,
    category: `${name}${category ? `, a ${category}` : ""}${detail ? ` known for ${detail}` : ""}`,
  });
}

function locationJsonLd(location: LocationRecord, type: string, locationId: string) {
  const name = getLocationName(location, "TheOutHaven location");
  const isRestaurant = String(location.location_type || type).toLowerCase().includes("restaurant");
  const image = getLocationImage(location);
  const addressParts = [location.address, location.city, location.state, location.zip_code].filter(Boolean);
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": isRestaurant ? "Restaurant" : "LocalBusiness",
    name,
    url: canonicalUrl(locationPath(type, locationId)),
    description: locationDescription(location),
  };

  if (image) jsonLd.image = openGraphImage(image);
  if (location.phone) jsonLd.telephone = location.phone;
  if (location.website) jsonLd.sameAs = [location.website];
  if (addressParts.length > 0) {
    jsonLd.address = {
      "@type": "PostalAddress",
      streetAddress: location.address || undefined,
      addressLocality: location.city || undefined,
      addressRegion: location.state || undefined,
      postalCode: location.zip_code || undefined,
      addressCountry: "US",
    };
  }
  if (location.latitude && location.longitude) {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
    };
  }
  if (isRestaurant && (location.cuisine || location.cuisine_type)) {
    jsonLd.servesCuisine = location.cuisine || location.cuisine_type;
  }

  return jsonLd;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type, locationId } = await params;
  const location = await loadLocation(type, locationId);
  const path = locationPath(type, locationId);

  if (!location) {
    return buildMetadata({
      title: "Location Not Found",
      description: "This TheOutHaven location is not currently searchable.",
      path,
      noIndex: true,
    });
  }

  const name = getLocationName(location, "TheOutHaven Location");
  const category = getPrimaryCategory(location);
  const area = [location.neighborhood, location.borough || location.city].filter(Boolean).join(", ");

  return buildMetadata({
    title: `${name}${area ? ` in ${area}` : ""}`,
    description: locationDescription(location),
    path,
    image: getLocationImage(location),
    noIndex: false,
  });
}

export default async function LocationDetailLayout({ children, params }: Props) {
  const { type, locationId } = await params;
  const location = await loadLocation(type, locationId);

  if (!location) return children;

  const name = getLocationName(location, "TheOutHaven Location");
  const category = getPrimaryCategory(location);
  const structuredData = [
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Explore", path: "/explore" },
      { name: category || "Locations", path: "/explore" },
      { name, path: locationPath(type, locationId) },
    ]),
    locationJsonLd(location, type, locationId),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />
      {children}
    </>
  );
}
