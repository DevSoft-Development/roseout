import Image from "next/image";
import Link from "next/link";

type BetaLaunchHeaderProps = {
  launchListHref?: string;
};

export default function BetaLaunchHeader({ launchListHref = "#launch-list" }: BetaLaunchHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070303]/90 px-4 py-3 text-white shadow-lg shadow-black/20 backdrop-blur-xl sm:px-6 lg:px-8">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3" aria-label="Beta launch header">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="TheOutHaven home">
          <Image
            src="/toh_logo.png"
            alt="TheOutHaven logo"
            width={44}
            height={44}
            className="h-10 w-10 shrink-0 rounded-full object-contain ring-1 ring-white/15 sm:h-11 sm:w-11"
            priority
          />
          <span className="truncate text-xl font-black tracking-tight text-white sm:text-2xl md:text-3xl">
            TheOutHaven
          </span>
        </Link>

        <div className="flex shrink-0 flex-col items-stretch gap-2 min-[430px]:flex-row min-[430px]:items-center sm:gap-3">
          <a
            href={launchListHref}
            className="rounded-full border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-center text-[0.65rem] font-black uppercase tracking-[0.12em] text-rose-50 transition hover:bg-rose-500/20 sm:px-4 sm:text-xs sm:tracking-[0.16em]"
          >
            Join Beta Launch List
          </a>
          <Link
            href="/beta/login"
            className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-2 text-center text-[0.65rem] font-black uppercase tracking-[0.12em] text-white transition hover:bg-white/12 sm:px-4 sm:text-xs sm:tracking-[0.16em]"
          >
            Log In
          </Link>
        </div>
      </nav>
    </header>
  );
}
