import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Log In",
  description:
    "Log in to your TheOutHaven account to manage plans, saved outings, listings, and reservations.",
  path: "/login",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
