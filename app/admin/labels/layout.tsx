import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Restaurant Labels Admin",
  description: "Print restaurant QR labels from TheOutHaven admin.",
  path: "/admin/labels",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
