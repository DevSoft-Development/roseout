import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Reset Password",
  description: "Set a new password for your TheOutHaven account.",
  path: "/reset-password",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
