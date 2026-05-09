import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Location Claims Admin",
  description:
    "Review and manage location ownership claims in TheOutHaven admin.",
  path: "/admin/claims",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
