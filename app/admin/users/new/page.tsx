"use client";

import Link from "next/link";
import { useState } from "react";

function generateStrongPassword() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
  let password = "";
  for (let i = 0; i < 14; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

export default function AddUserPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [useManual, setUseManual] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const form = new FormData(e.currentTarget);

    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      body: form,
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to create user");
      setLoading(false);
      return;
    }

    window.location.href = "/admin/users?created=1";
  };

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1000px]">
        {/* HEADER */}
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_35%),linear-gradient(135deg,#160b0b,#090706_55%,#140f0a)] p-5 shadow-2xl sm:p-6">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-rose-300">
                TheOutHaven Admin
              </p>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Add User
              </h1>

              <p className="mt-3 text-sm text-white/60">
                Create a new platform user securely.
              </p>
            </div>

            <Link
              href="/admin/users"
              className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/70 hover:bg-white/10 hover:text-white"
            >
              Back
            </Link>
          </div>
        </section>

        {/* FORM */}
        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
          <form onSubmit={handleSubmit} className="grid gap-5 p-5">
            {/* EMAIL */}
            <div>
              <label className="text-sm font-black">Email</label>
              <input
                name="email"
                required
                type="email"
                className="mt-2 h-12 w-full rounded-2xl border border-black/10 px-4 font-bold outline-none focus:border-rose-500"
                placeholder="user@email.com"
              />
            </div>

            {/* PASSWORD */}
            <div className="rounded-2xl border border-black/10 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black">Password Setup</p>

                <button
                  type="button"
                  onClick={() => setUseManual(!useManual)}
                  className="text-xs font-black text-rose-600 hover:underline"
                >
                  {useManual ? "Use Generated" : "Create Password"}
                </button>
              </div>

              <div className="mt-3">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 w-full rounded-xl border border-black/10 px-4 font-bold outline-none focus:border-rose-500"
                  placeholder="Secure password"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {!useManual && (
                  <button
                    type="button"
                    onClick={() => setPassword(generateStrongPassword())}
                    className="rounded-full bg-[#1b1210] px-4 py-2 text-xs font-black text-white"
                  >
                    Generate
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="rounded-full border border-black/10 px-4 py-2 text-xs font-black"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* ROLE */}
            <div>
              <label className="text-sm font-black">Role</label>
              <select
                name="role"
                className="mt-2 h-12 w-full rounded-2xl border border-black/10 px-4 font-bold outline-none focus:border-rose-500"
              >
                <option value="user">User</option>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="superuser">Superuser</option>
              </select>
            </div>

            {/* SUBMIT */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg hover:scale-[1.03] disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create User"}
              </button>

              <Link
                href="/admin/users"
                className="rounded-full border border-black/10 px-6 py-3 text-sm font-black"
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}