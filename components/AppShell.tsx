"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import TheOutHavenFooter from "@/components/TheOutHavenFooter";

const subscribe = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  const isAdmin =
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/reserve/dashboard");
  const isLaunchRoute = pathname === "/" || pathname?.startsWith("/launch/verify");
  const showGlobalChrome = mounted && !isAdmin && !isLaunchRoute;

  return (
    <>
      {showGlobalChrome && <TheOutHavenHeader />}
      {children}
      {showGlobalChrome && <TheOutHavenFooter />}
    </>
  );
}
