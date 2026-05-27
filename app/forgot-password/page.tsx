"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    setMessage("");
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setMessage("Password reset link sent. Please check your email.");
      setEmail("");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
      <form
        onSubmit={handleReset}
        className="w-full max-w-md rounded-[2rem] bg-white p-8 text-black shadow-2xl"
      >
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-yellow-600">
          TheOutHaven Account Recovery
        </p>

        <h1 className="text-3xl font-extrabold">Forgot Password</h1>

        <p className="mt-2 text-sm text-neutral-500">
          Enter your account email and we’ll send you a secure password reset link.
        </p>

        {error && (
          <div className="mt-5 rounded-2xl bg-red-100 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-2xl bg-green-100 p-4 text-sm font-semibold text-green-700">
            {message}
          </div>
        )}

        <label className="mt-6 block text-sm font-bold">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-yellow-500"
        />

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-full bg-yellow-500 px-6 py-4 font-extrabold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>

        <Link
          href="/login"
          className="mt-5 block text-center text-sm font-bold text-neutral-600 hover:text-black"
        >
          Back to Login
        </Link>
      </form>
    </main>
  );
}