import Image from "next/image";
import Link from "next/link";

type BetaLaunchHeaderProps = {
  launchListHref?: string;
};

export default function BetaLaunchHeader({ launchListHref = "#launch-list" }: BetaLaunchHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-black/90 px-4 py-4 text-white backdrop-blur-xl sm:px-6 lg:px-8">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4" aria-label="Prelaunch header">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="TheOutHaven home">
          <Image
            src="/toh_logo.png"
            alt="TheOutHaven logo"
            width={46}
            height={46}
            className="h-11 w-11 shrink-0 rounded-full object-contain"
            priority
          />
          <span className="truncate text-xl font-black tracking-tight text-white sm:text-2xl">
            TheOutHaven
          </span>
        </Link>

        <div className="hidden items-center gap-8 text-sm font-bold text-white/75 md:flex">
          <a href="#how-it-works" className="transition hover:text-white">How It Works</a>
          <Link href="/business" className="transition hover:text-white">For Businesses</Link>
          <Link href="/about" className="transition hover:text-white">About Us</Link>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="rounded-lg border border-[#e1062a] px-4 py-2.5 text-xs font-black text-white transition hover:bg-[#e1062a] sm:px-5 sm:text-sm"
          >
            Log In
          </Link>
          <a
            href={launchListHref}
            className="hidden rounded-lg bg-[#e1062a] px-5 py-2.5 text-sm font-black text-white transition hover:bg-red-500 lg:inline-flex"
          >
            Get Prelaunch Access
          </a>
        </div>
      </nav>
    </header>
  );
}
