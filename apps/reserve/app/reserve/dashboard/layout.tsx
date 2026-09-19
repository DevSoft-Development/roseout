import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({ title: "Reserve Dashboard", path: "/reserve/dashboard", noIndex: true });

export default function ReserveDashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
