import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Verify Account",
  description: "Confirm and verify your TheOutHaven account.",
  path: "/verify",
  noIndex: true,
});

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
