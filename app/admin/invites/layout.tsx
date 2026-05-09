import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Restaurant Invites Admin",
  description: "Create and manage restaurant invitations in TheOutHaven admin.",
  path: "/admin/invites",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
