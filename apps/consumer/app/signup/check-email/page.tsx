import Link from "next/link";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const intendedPath = sanitizeIntendedPath(sp.next);
  const businessSignup = Boolean(intendedPath?.startsWith("/business/claim"));
  const loginHref = intendedPath
    ? `/login?next=${encodeURIComponent(intendedPath)}`
    : "/login";

  return (
    <main className="min-h-screen bg-[#090706] px-4 pt-28 text-white">
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-white/10 bg-white/[0.05] p-8 text-center">
        <p className="text-xs font-black uppercase tracking-[.3em] text-rose-200">
          Email confirmation required
        </p>
        <h1 className="mt-3 text-4xl font-black">
          {businessSignup
            ? "Verify your email to continue your business setup."
            : "Check your email to finish creating your TheOutHaven account."}
        </h1>
        {sp.email ? (
          <p className="mt-4 text-white/65">
            We sent a confirmation link to{" "}
            <span className="font-bold text-white">{sp.email}</span>.
          </p>
        ) : null}
        <p className="mt-4 text-sm text-white/55">
          {businessSignup
            ? "Your selected plan and business location are saved. After verification, sign in and you will return to the claim."
            : "Open the confirmation link, then return to sign in. If you do not see it, check spam or contact support."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href={loginHref} className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black">
            {businessSignup ? "Sign in and continue" : "Back to login"}
          </Link>
          <Link href="/support" className="rounded-full border border-white/15 px-5 py-3 text-sm font-black">
            Support
          </Link>
        </div>
      </section>
    </main>
  );
}
