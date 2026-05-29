import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({ title: "Owner Area", path: "/owner", noIndex: true });

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
