"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import TheOutHavenFooter from "@/components/TheOutHavenFooter";
import IdleLogout from "@/components/auth/IdleLogout";

const subscribe = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  const isAdmin =
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/reserve/dashboard");
  const isLaunchRoute =
    pathname === "/" || pathname?.startsWith("/launch/verify");
  const isStandaloneAuthRoute = pathname === "/beta/login";
  const isOwnerDashboard = pathname === "/locations/dashboard";
  const showGlobalChrome =
    mounted &&
    !isAdmin &&
    !isLaunchRoute &&
    !isStandaloneAuthRoute &&
    !isOwnerDashboard;

  return (
    <>
      {showGlobalChrome && <TheOutHavenHeader />}
      {mounted &&
        !isAdmin &&
        !isLaunchRoute &&
        !isStandaloneAuthRoute &&
        !isOwnerDashboard && <IdleLogout />}
      {children}
      {showGlobalChrome && <TheOutHavenFooter />}
    </>
  );
}
