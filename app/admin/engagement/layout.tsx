import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Restaurant Engagement Admin",
  description: "Review restaurant engagement metrics in TheOutHaven admin.",
  path: "/admin/engagement",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
