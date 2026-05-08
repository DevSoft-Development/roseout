import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Your Outing Plan",
  description:
    "Review your personalized TheOutHaven outing plan with matched restaurants, activities, and recommendations.",
  path: "/plan",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
