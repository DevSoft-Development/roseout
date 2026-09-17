import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Business Sign In | TheOutHaven",
  description: "Sign in to TheOutHaven Business to manage your location, reservations, events, experiences, and business tools.",
  robots: { index: false, follow: false },
};

export default function BusinessLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
