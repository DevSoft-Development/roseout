import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Roseout Admin Dashboard",
    template: "%s | Roseout Admin Dashboard",
  },
  description:
    "Manage Roseout locations, reservations, support tickets, and admin workflows.",
};

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
