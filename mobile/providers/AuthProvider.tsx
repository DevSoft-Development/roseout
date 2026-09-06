import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getOrCreateGuestId } from "@/lib/auth/storage";
import { supabase } from "@/lib/auth/supabase";

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  guestId: string | null;
  isGuest: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void getOrCreateGuestId().then((id) => {
      if (active) setGuestId(id);
    });

    if (!supabase) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => ({
    loading,
    session,
    user: session?.user ?? null,
    guestId,
    isGuest: !session,
    async signIn(email, password) {
      if (!supabase) return "Mobile authentication is not configured.";
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error?.message ?? null;
    },
    async signUp(email, password) {
      if (!supabase) return "Mobile authentication is not configured.";
      const { error } = await supabase.auth.signUp({ email: email.trim(), password });
      return error?.message ?? null;
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut();
      setSession(null);
    },
  }), [guestId, loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
