import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getOrCreateGuestId } from "@/lib/auth/storage";
import { supabase } from "@/lib/auth/supabase";

const SMS_CONSENT_TEXT = "I agree to receive SMS messages from TheOutHaven about my account, saved plans, OUTing reminders, reservations, and optional offers. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help. Consent is not a condition of purchase.";

type SignInInput = { email: string; password: string; captchaToken: string };
type SignUpInput = {
  firstName: string;
  email: string;
  password: string;
  phone: string;
  birthMonth: number;
  smsConsent: boolean;
  captchaToken: string;
};
type AuthResult = { error: string | null; requiresEmailConfirmation?: boolean };

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  guestId: string | null;
  isGuest: boolean;
  signIn: (input: SignInInput) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getOrCreateGuestId().then((id) => { if (active) setGuestId(id); });
    if (!supabase) {
      setLoading(false);
      return () => { active = false; };
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
    async signIn(input) {
      if (!supabase) return { error: "Mobile authentication is not configured." };
      const { error } = await supabase.auth.signInWithPassword({
        email: input.email.trim(),
        password: input.password,
        options: { captchaToken: input.captchaToken },
      });
      return { error: error?.message ?? null };
    },
    async signUp(input) {
      if (!supabase) return { error: "Mobile authentication is not configured." };
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          captchaToken: input.captchaToken,
          data: {
            first_name: input.firstName.trim(),
            phone_e164: input.phone,
            birth_month: input.birthMonth,
            sms_consent: input.smsConsent,
            sms_consent_text: input.smsConsent ? SMS_CONSENT_TEXT : null,
            signup_source: "mobile_app",
          },
        },
      });
      return { error: error?.message ?? null, requiresEmailConfirmation: !error && !data.session };
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
