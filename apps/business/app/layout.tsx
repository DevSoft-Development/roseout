import "../../../app/globals.css";
import "../../../app/location-editor-layout.css";
import "../../../app/reserve-forms.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "TheOutHaven Business",
  robots: { index: false, follow: false },
};

export default function BusinessRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
