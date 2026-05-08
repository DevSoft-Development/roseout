import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Admin Access Denied",
  description: "Admin access is required to view this TheOutHaven page.",
  path: "/admin/unauthorized",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
