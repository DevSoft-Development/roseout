import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Create an Outing Plan",
  description:
    "Create a curated outing plan with restaurants, activities, neighborhoods, and ideas across New York City and Long Island.",
  path: "/create",
});

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
