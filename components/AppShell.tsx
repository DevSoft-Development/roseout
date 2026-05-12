"use client";

import { usePathname } from "next/navigation";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import TheOutHavenFooter from "@/components/TheOutHavenFooter";
import SessionTimeout from "@/components/SessionTimeout";

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
      <SessionTimeout />
      {!isAdmin && <TheOutHavenHeader />}
      {children}
      {!isAdmin && <TheOutHavenFooter />}
    </>
  );
}