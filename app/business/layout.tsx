import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Business Growth for Restaurants & Activities",
  description:
    "Get discovered by people planning outings, date nights, dinners, and activities with TheOutHaven business tools.",
  path: "/business",
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
