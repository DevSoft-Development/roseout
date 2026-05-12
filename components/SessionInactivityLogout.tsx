"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
const LAST_ACTIVITY_KEY = "theouthaven:last-activity-at";
const LOGOUT_EVENT_KEY = "theouthaven:inactivity-logout-at";

const ACTIVITY_EVENTS = [
  "click",
  "keydown",
  "mousedown",
  "mousemove",
  "scroll",
  "touchstart",
  "visibilitychange",
] as const;

function isAuthPage(pathname: string | null) {
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname?.startsWith("/auth/")
  );
}

function isProtectedPath(pathname: string | null) {
  if (!pathname) return false;

  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/user") ||
    pathname.startsWith("/owner") ||
    pathname.startsWith("/restaurants/dashboard") ||
    pathname.startsWith("/restaurants/update") ||
    pathname.startsWith("/locations/dashboard") ||
    pathname.startsWith("/locations/edit") ||
    pathname.startsWith("/reserve/dashboard") ||
    pathname.startsWith("/reserve/portal") ||
    pathname.startsWith("/support/tickets")
  );
}

function getLastActivityAt() {
  const storedValue = window.localStorage.getItem(LAST_ACTIVITY_KEY);
  const timestamp = storedValue ? Number(storedValue) : 0;

  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

function setLastActivityAt(timestamp = Date.now()) {
  window.localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
}

export default function SessionInactivityLogout() {
  const pathname = usePathname();
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const logoutInProgressRef = useRef(false);
  const lastActivityWriteRef = useRef(0);

  useEffect(() => {
    if (isAuthPage(pathname)) return;

    supabaseRef.current ??= createClient();

    const redirectAfterLogout = () => {
      if (isProtectedPath(pathname)) {
        router.replace("/login?reason=inactive");
      }
    };

    const signOutForInactivity = async () => {
      if (logoutInProgressRef.current) return;

      logoutInProgressRef.current = true;
      window.localStorage.setItem(LOGOUT_EVENT_KEY, String(Date.now()));

      try {
        await supabaseRef.current?.auth.signOut();
      } finally {
        window.localStorage.removeItem(LAST_ACTIVITY_KEY);
        redirectAfterLogout();
      }
    };

    const recordActivity = () => {
      const now = Date.now();

      if (document.visibilityState === "hidden") return;
      if (now - lastActivityWriteRef.current < 1000) return;

      lastActivityWriteRef.current = now;
      setLastActivityAt(now);
    };

    const checkForTimeout = async () => {
      const {
        data: { session },
      } = await supabaseRef.current!.auth.getSession();

      if (!session) {
        setLastActivityAt();
        return;
      }

      if (Date.now() - getLastActivityAt() >= INACTIVITY_TIMEOUT_MS) {
        await signOutForInactivity();
      }
    };

    const handleStorage = async (event: StorageEvent) => {
      if (event.key === LOGOUT_EVENT_KEY && event.newValue) {
        await signOutForInactivity();
      }
    };

    setLastActivityAt();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });
    window.addEventListener("storage", handleStorage);

    const interval = window.setInterval(() => {
      void checkForTimeout();
    }, CHECK_INTERVAL_MS);

    void checkForTimeout();

    return () => {
      window.clearInterval(interval);
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      window.removeEventListener("storage", handleStorage);
    };
  }, [pathname, router]);

  return null;
}
