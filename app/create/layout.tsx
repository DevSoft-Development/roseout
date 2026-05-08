import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Create an Outing Plan",
  description:
    "Tell TheOutHaven your vibe, location, budget, and mood to create a personalized outing plan.",
  path: "/create",
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
