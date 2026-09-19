import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Business Dashboard",
  path: "/business/dashboard",
  noIndex: true,
});

export default function BusinessDashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
