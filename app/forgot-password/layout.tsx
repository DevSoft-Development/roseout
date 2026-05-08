import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Forgot Password",
  description: "Reset access to your TheOutHaven account.",
  path: "/forgot-password",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
