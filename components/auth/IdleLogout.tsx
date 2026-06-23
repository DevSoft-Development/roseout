"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const WARNING_BEFORE_TIMEOUT_MS = 5 * 60 * 1000;
const WARNING_TIMEOUT_MS = IDLE_TIMEOUT_MS - WARNING_BEFORE_TIMEOUT_MS;
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

export default function IdleLogout() {
  const router = useRouter();
  const pathname = usePathname();
  const [hasUser, setHasUser] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    warningTimerRef.current = null;
    logoutTimerRef.current = null;
  }, []);

  const signOut = useCallback(async () => {
    clearTimers();
    setShowWarning(false);
    setHasUser(false);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }, [clearTimers, router]);

  const resetTimers = useCallback(() => {
    clearTimers();
    setShowWarning(false);

    if (!hasUser) return;

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
    }, WARNING_TIMEOUT_MS);

    logoutTimerRef.current = setTimeout(() => {
      void signOut();
    }, IDLE_TIMEOUT_MS);
  }, [clearTimers, hasUser, signOut]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      setHasUser(Boolean(user));
    }

    void loadUser();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setHasUser(Boolean(session?.user));
      if (!session?.user) {
        clearTimers();
        setShowWarning(false);
      }
    });

    return () => {
      active = false;
      clearTimers();
      data.subscription.unsubscribe();
    };
  }, [clearTimers]);

  useEffect(() => {
    if (!hasUser) {
      clearTimers();
      setShowWarning(false);
      return;
    }

    resetTimers();

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, resetTimers, { passive: true });
    });

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, resetTimers);
      });
      clearTimers();
    };
  }, [clearTimers, hasUser, resetTimers]);

  useEffect(() => {
    setShowWarning(false);
  }, [pathname]);

  if (!hasUser || !showWarning) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[calc(100vw-2rem)] max-w-sm rounded-[1.5rem] border border-white/10 bg-black/95 p-4 text-white shadow-2xl shadow-black/50 backdrop-blur-xl sm:bottom-6 sm:right-6">
      <p className="text-xs font-black uppercase tracking-[.22em] text-rose-200">
        Inactive session
      </p>
      <p className="mt-2 text-sm font-bold text-white/85">
        You’ll be signed out soon due to inactivity.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={resetTimers}
          className="rounded-full bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-white/90"
        >
          Stay signed in
        </button>
        <button
          type="button"
          onClick={signOut}
          className="rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black text-white transition hover:bg-red-500"
        >
          Sign out now
        </button>
      </div>
    </div>
  );
}
