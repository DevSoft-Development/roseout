import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Restaurant Dashboard",
  description:
    "Manage restaurant listing details, engagement, and performance on TheOutHaven.",
  path: "/restaurants/dashboard",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
