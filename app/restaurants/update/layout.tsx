import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Update Restaurant Listing",
  description:
    "Update your restaurant listing and business details on TheOutHaven.",
  path: "/restaurants/update",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
