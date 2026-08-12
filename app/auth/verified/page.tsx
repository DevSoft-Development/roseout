import Link from "next/link";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { status, next } = await searchParams;
  const ok = status === "success";
  const intendedPath = sanitizeIntendedPath(next);
  const loginHref = intendedPath
    ? `/login?next=${encodeURIComponent(intendedPath)}`
    : "/login";

  return (
    <main className="min-h-screen bg-[#070303] px-5 py-16 text-white">
      <section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[.06] p-8">
        <h1 className="text-3xl font-black">
          {ok ? "Email verified" : "Verification link expired"}
        </h1>
        <p className="mt-3 text-white/65">
          {ok
            ? "Your TheOutHaven email is verified. Log in to continue where you left off."
            : "Please request a new verification link or contact support if you need help."}
        </p>
        <Link
          className="mt-6 inline-flex rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black"
          href={loginHref}
        >
          {ok && intendedPath ? "Log in and continue" : "Go to login"}
        </Link>
      </section>
    </main>
  );
}
