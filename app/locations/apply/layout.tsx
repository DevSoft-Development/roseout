import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Apply for a Location Listing",
  description:
    "Apply to manage how your restaurant, activity, or experience appears on TheOutHaven.",
  path: "/locations/apply",
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
