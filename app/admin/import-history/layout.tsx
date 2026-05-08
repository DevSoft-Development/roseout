import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Import History Admin",
  description:
    "Review Google import runs and listing import history in TheOutHaven admin.",
  path: "/admin/import-history",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
