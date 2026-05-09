import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Review Intelligence",
  description:
    "Test TheOutHaven review intelligence and recommendation tooling.",
  path: "/reviews",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
