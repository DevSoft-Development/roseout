"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import TheOutHavenFooter from "@/components/TheOutHavenFooter";
import IdleLogout from "@/components/auth/IdleLogout";

const subscribe = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function isLocationEditorPath(pathname: string | null) {
  const path = pathname || "";
  return (
    /^\/locations\/(restaurants|restaurant|activities|activity)\/[^/]+\/edit\/?$/.test(path) ||
    /^\/locations\/edit\/(restaurants|restaurant|activities|activity)\/[^/]+\/?$/.test(path)
  );
}

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
  const isLocationEditor = isLocationEditorPath(pathname);
  const hidesGlobalChrome =
    isAdmin ||
    isLaunchRoute ||
    isStandaloneAuthRoute ||
    isOwnerDashboard ||
    isLocationEditor;
  const showGlobalChrome = mounted && !hidesGlobalChrome;

  return (
    <>
      {showGlobalChrome && <TheOutHavenHeader />}
      {mounted && !hidesGlobalChrome && <IdleLogout />}
      {children}
      {showGlobalChrome && <TheOutHavenFooter />}
    </>
  );
}
