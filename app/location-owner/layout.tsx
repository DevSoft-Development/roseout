import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({ title: "Location Owner", path: "/location-owner", noIndex: true });

export default function LocationOwnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
