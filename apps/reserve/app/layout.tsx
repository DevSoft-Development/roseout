import "../../../app/globals.css";
import "../../../app/location-editor-layout.css";
import "../../../app/reserve-forms.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "TheOutHaven Reserve",
  description: "Reservations, waitlist, seating, and guest management with TheOutHaven Reserve.",
};

export default function ReserveRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
