import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Edit Location Listing",
  description:
    "Update a TheOutHaven location listing through a secure edit link.",
  path: "/locations/edit",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
