import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Contact TheOutHaven",
  description:
    "Contact TheOutHaven for support, partnerships, restaurants, activities, reservations, and outing planning questions.",
  path: "/contact",
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
