import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Pricing for Businesses",
  description:
    "Compare TheOutHaven pricing for restaurants, activities, and experiences that want to reach outing planners.",
  path: "/pricing",
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
