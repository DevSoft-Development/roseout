"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Turnstile } from "@marsidev/react-turnstile";

export default function LocationsSignupPage({
  searchParams,
}: {
  searchParams: { invite?: string; code?: string };
}) {
  const supabase = createClient();

  const inviteCode = searchParams?.invite || searchParams?.code || "";

  const [loading, setLoading] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(!!inviteCode);
  const [message, setMessage] = useState("");
  const [inviteValid, setInviteValid] = useState(true);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const [form, setForm] = useState({
    owner_name: "",
    owner_email: "",
    owner_phone: "",
    password: "",
    confirmPassword: "",
    location_name: "",
    invite_code: inviteCode,
  });

  const update = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // CHECK INVITE
  useEffect(() => {
    const checkInvite = async () => {
      if (!inviteCode) return;

      setCheckingInvite(true);

      const { data } = await supabase
        .from("restaurant_claim_invites")
        .select("*")
        .eq("invite_code", inviteCode)
        .maybeSingle();

      if (!data) {
        setInviteValid(false);
        setMessage("This invite link is invalid.");
      } else {
        setInviteValid(true);
        if (data.restaurant_name) {
          update("location_name", data.restaurant_name);
        }
      }

      setCheckingInvite(false);
    };

    checkInvite();
  }, [inviteCode]);

  // SIGNUP
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.owner_name || !form.owner_email || !form.password) {
      setMessage("Please fill all required fields.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    if (!captchaToken) {
      setMessage("Please complete the verification.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.owner_email,
        password: form.password,
        options: {
          data: {
            role: "location_owner",
            owner_name: form.owner_name,
            owner_phone: form.owner_phone,
          },
        },
      });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      await supabase.from("location_signup_requests").insert({
        user_id: data.user?.id,
        owner_name: form.owner_name,
        owner_email: form.owner_email,
        owner_phone: form.owner_phone,
        location_name: form.location_name,
        invite_code: form.invite_code || null,
        status: "pending",
      });

      setMessage(
        "Account created. Check your email to confirm. We’ll review your request."
      );

      setForm({
        ...form,
        password: "",
        confirmPassword: "",
      });
    } catch {
      setMessage("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingInvite) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Checking invite...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white">
      <div className="mx-auto max-w-xl">

        {/* HEADER */}
        <div className="mb-6 rounded-2xl bg-[#111] p-6">
          <h1 className="text-3xl font-bold">Locations Portal Signup</h1>
          <p className="text-neutral-400 mt-2">
            Create your account to manage your location
          </p>
        </div>

        {/* FORM */}
        <form
          onSubmit={handleSignup}
          className="rounded-2xl bg-white p-6 text-black shadow-xl"
        >
          {message && (
            <div className="mb-4 text-sm font-bold text-red-600">
              {message}
            </div>
          )}

          <input
            placeholder="Full Name"
            value={form.owner_name}
            onChange={(e) => update("owner_name", e.target.value)}
            className="w-full mb-3 p-3 border rounded"
          />

          <input
            placeholder="Email"
            value={form.owner_email}
            onChange={(e) => update("owner_email", e.target.value)}
            className="w-full mb-3 p-3 border rounded"
          />

          <input
            placeholder="Phone"
            value={form.owner_phone}
            onChange={(e) => update("owner_phone", e.target.value)}
            className="w-full mb-3 p-3 border rounded"
          />

          <input
            placeholder="Location Name"
            value={form.location_name}
            onChange={(e) => update("location_name", e.target.value)}
            className="w-full mb-3 p-3 border rounded"
          />

          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            className="w-full mb-3 p-3 border rounded"
          />

          <input
            type="password"
            placeholder="Confirm Password"
            value={form.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
            className="w-full mb-4 p-3 border rounded"
          />

          {/* CAPTCHA */}
          <div className="mb-4">
            <Turnstile
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
              onSuccess={(token) => setCaptchaToken(token)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-3 rounded-full font-bold"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>
      </div>
    </main>
  );
}