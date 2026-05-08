import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Locations Portal Signup",
  description:
    "Create a TheOutHaven locations portal account for managing business listings.",
  path: "/locations/signup",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
