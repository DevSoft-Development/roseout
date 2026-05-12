"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const LAST_ACTIVITY_KEY = "theouthaven_last_activity_at";
const ACTIVITY_EVENTS = [
  "click",
  "keydown",
  "mousemove",
  "scroll",
  "touchstart",
  "visibilitychange",
] as const;

export default function SessionTimeout() {
  useEffect(() => {
    const supabase = createClient();
    let timeoutId: number | null = null;
    let lastRecordedAt = 0;
    let signingOut = false;

    const clearTimer = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };

    const signOutForTimeout = async () => {
      if (signingOut) return;
      signingOut = true;

      await supabase.auth.signOut();

      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login?timeout=1";
      }
    };

    const scheduleTimeout = async () => {
      clearTimer();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const lastActivity = Number(
        window.localStorage.getItem(LAST_ACTIVITY_KEY) || Date.now()
      );
      const expiresIn = SESSION_TIMEOUT_MS - (Date.now() - lastActivity);

      if (expiresIn <= 0) {
        await signOutForTimeout();
        return;
      }

      timeoutId = window.setTimeout(signOutForTimeout, expiresIn);
    };

    const recordActivity = () => {
      const now = Date.now();

      if (now - lastRecordedAt < 15_000) return;

      lastRecordedAt = now;
      window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      void scheduleTimeout();
    };

    if (!window.localStorage.getItem(LAST_ACTIVITY_KEY)) {
      window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });

    const authSubscription = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
        void scheduleTimeout();
      }

      if (event === "SIGNED_OUT") {
        clearTimer();
      }
    });

    void scheduleTimeout();

    return () => {
      clearTimer();
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      authSubscription.data.subscription.unsubscribe();
    };
  }, []);

  return null;
}
