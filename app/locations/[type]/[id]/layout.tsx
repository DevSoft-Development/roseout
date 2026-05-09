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
    type: string;
    id: string;
  }>;
};

export async function generateMetadata({
  params,
}: SeoLayoutProps): Promise<Metadata> {
  const { type, id } = await params;
  const location = await getLocationSeoData(type, id);

  if (!location) {
    return createMetadata({
      title: "Location Details",
      description:
        "Explore location details, reviews, scores, and outing recommendations on TheOutHaven.",
      path: `/locations/${type}/${id}`,
    });
  }

  return createMetadata({
    title: buildLocationTitle(location),
    description: buildLocationDescription(location),
    path: `/locations/${type}/${id}`,
    image: location.image || "/hero-outing.jpg",
    keywords: [
      location.name,
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
