import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Reservation Confirmation",
  description:
    "View your TheOutHaven reservation confirmation and booking details.",
  path: "/reserve/confirmation",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
