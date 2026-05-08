import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Reservation Management",
  description:
    "Manage reservation requests and booking operations in TheOutHaven Reserve.",
  path: "/reserve/dashboard/reservations",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
