import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Ranking Engine Admin",
  description: "Manage TheOutHaven ranking and scoring tools.",
  path: "/admin/rankings",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
