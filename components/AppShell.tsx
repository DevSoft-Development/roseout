"use client";

import { usePathname } from "next/navigation";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import TheOutHavenFooter from "@/components/TheOutHavenFooter";
import SessionInactivityLogout from "@/components/SessionInactivityLogout";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isAdmin =
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/reserve/dashboard");

  return (
    <>
      <SessionInactivityLogout />
      {!isAdmin && <TheOutHavenHeader />}
      {children}
      {!isAdmin && <TheOutHavenFooter />}
    </>
  );
}