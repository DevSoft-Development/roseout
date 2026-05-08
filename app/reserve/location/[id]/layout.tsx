import type { Metadata } from "next";
import { createMetadata } from "@/lib/seo";
import {
  buildLocationDescription,
  buildLocationTitle,
  getLocationSeoData,
} from "@/lib/locationSeo";

type SeoLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    id: string;
  }>;
};

export async function generateMetadata({
  params,
}: SeoLayoutProps): Promise<Metadata> {
  const { id } = await params;
  const location = await getLocationSeoData("location", id);

  if (!location) {
    return createMetadata({
      title: "Reserve This Location",
      description:
        "Reserve a restaurant, activity, or experience through TheOutHaven.",
      path: `/reserve/location/${id}`,
    });
  }

  return createMetadata({
    title: `Reserve ${buildLocationTitle(location)}`,
    description: buildLocationDescription(location),
    path: `/reserve/location/${id}`,
    image: location.image || "/hero-outing.jpg",
    keywords: [
      location.name,
      "reservation",
      location.type,
      location.city,
      location.state,
      location.cuisine,
      location.category,
    ].filter(Boolean) as string[],
  });
}

export default function SeoLayout({ children }: SeoLayoutProps) {
  return children;
}
