import Image from "next/image";
import Link from "next/link";
import BetaLoginForm from "./BetaLoginForm";

export const metadata = { title: "Beta Login | TheOutHaven" };

export default function BetaLoginPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(225,29,72,0.18),transparent_34%),linear-gradient(135deg,#090706,#140c0b_52%,#090706)] px-4 pb-12 pt-28 text-white sm:pt-32">
      <section className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/45 backdrop-blur-xl">
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_38%),rgba(0,0,0,0.22)] p-7 text-center sm:p-8">
            <Link href="/beta" className="mx-auto inline-flex items-center gap-3" aria-label="TheOutHaven beta home">
              <Image src="/toh_logo.png" alt="TheOutHaven logo" width={52} height={52} className="h-12 w-12 rounded-full object-contain ring-1 ring-white/15" priority />
              <span className="text-2xl font-black tracking-tight">TheOutHaven</span>
            </Link>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.32em] text-rose-200">Beta Access</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">Beta Login</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/70">Log in to access your beta tasks, updates, and giveaway progress.</p>
          </div>
          <div className="p-7 sm:p-8">
            <BetaLoginForm />
            <div className="mt-6 flex flex-col gap-3 text-center text-sm text-white/65">
              <Link href="/forgot-password" className="font-bold text-rose-100 transition hover:text-white">Forgot password?</Link>
              <Link href="/beta#launch-list" className="font-bold text-rose-100 transition hover:text-white">Need beta access? Join the beta list</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
