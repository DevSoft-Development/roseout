import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({ title: "Create Password", path: "/auth/create-password", noIndex: true });

export default function CreatePasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
