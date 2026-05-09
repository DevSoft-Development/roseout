import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { defaultDescription, siteName, siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: "TheOutHaven | AI Outing Planner",
    template: `%s | ${siteName}`,
  },
  description: defaultDescription,
  keywords: [
    "outing planner",
    "date night planner",
    "restaurant recommendations",
    "activity recommendations",
    "AI outing planner",
    "TheOutHaven",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "TheOutHaven | AI Outing Planner",
    description: defaultDescription,
    url: "/",
    siteName,
    images: [
      {
        url: "/hero-outing.jpg",
        width: 1200,
        height: 630,
        alt: "TheOutHaven AI outing planner",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TheOutHaven | AI Outing Planner",
    description: defaultDescription,
    images: ["/hero-outing.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
