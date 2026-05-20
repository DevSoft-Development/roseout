"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function TheOutHavenHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);

    handleScroll();
    window.addEventListener("scroll", handleScroll);

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(href));

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/95 text-white backdrop-blur-xl transition-all duration-300 ${
        scrolled || menuOpen ? "shadow-lg shadow-black/40" : ""
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 transition-all duration-300 sm:px-6 ${
          scrolled ? "h-16" : "h-20"
        }`}
      >
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span
            className={`flex shrink-0 items-center justify-center rounded-full bg-[#e1062a] font-black text-white transition-all duration-300 ${
              scrolled ? "h-9 w-9 text-sm" : "h-11 w-11 text-lg"
            }`}
          >
            R
          </span>

          <span className="truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
            TheOutHaven
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <NavLink href="/" label="Home" active={isActive("/")} />
          <NavLink href="/create" label="Create Outing" active={isActive("/create")} />
          <NavLink href="/explore" label="Explore" active={isActive("/explore")} />
          <NavLink href="/restaurants" label="Restaurants" active={isActive("/restaurants")} />
          <NavLink href="/activities" label="Activities" active={isActive("/activities")} />
          <NavLink href="/location/apply" label="Business" active={isActive("/location/apply")} />
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <Link href="/login" className={`text-sm font-bold transition ${isActive("/login") ? "text-white" : "text-white/45 hover:text-white"}`}>
            Sign In
          </Link>

          <Link href="/signup" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black text-white transition hover:bg-red-500">
            Create Account
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label={menuOpen ? "Close mobile menu" : "Open mobile menu"}
          aria-expanded={menuOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white transition hover:bg-white hover:text-black md:hidden"
        >
          <span className="sr-only">
            {menuOpen ? "Close mobile menu" : "Open mobile menu"}
          </span>

          <span className="relative h-5 w-5">
            <span
              className={`absolute left-0 top-1 block h-[2px] w-5 rounded-full bg-current transition-all duration-300 ${
                menuOpen ? "top-2 rotate-45" : ""
              }`}
            />
            <span
              className={`absolute left-0 top-2 block h-[2px] w-5 rounded-full bg-current transition-all duration-300 ${
                menuOpen ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 top-3 block h-[2px] w-5 rounded-full bg-current transition-all duration-300 ${
                menuOpen ? "top-2 -rotate-45" : ""
              }`}
            />
          </span>
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-white/10 bg-black/95 px-4 pb-5 pt-3 shadow-2xl shadow-black/50 backdrop-blur-xl md:hidden">
          <div className="mx-auto max-w-7xl space-y-2">
            <MobileMenuLink href="/" label="Home" active={isActive("/")} />
            <MobileMenuLink href="/create" label="Create Outing" active={isActive("/create")} />
            <MobileMenuLink href="/explore" label="Explore" active={isActive("/explore")} />
            <MobileMenuLink href="/restaurants" label="Restaurants" active={isActive("/restaurants")} />
            <MobileMenuLink href="/activities" label="Activities" active={isActive("/activities")} />
            <MobileMenuLink href="/location/apply" label="Business" active={isActive("/location/apply")} />
            <MobileMenuLink href="/login" label="Sign In" active={isActive("/login")} />
            <MobileMenuLink href="/signup" label="Create Account" active={isActive("/signup")} featured />
          </div>
        </div>
      )}
    </header>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`relative text-sm font-black transition ${
        active ? "text-white" : "text-white/45 hover:text-white"
      }`}
    >
      {label}

      <span
        className={`absolute -bottom-1 left-0 h-[2px] bg-[#e1062a] transition-all duration-300 ${
          active ? "w-full" : "w-0"
        }`}
      />
    </Link>
  );
}

function MobileMenuLink({
  href,
  label,
  active,
  featured,
}: {
  href: string;
  label: string;
  active: boolean;
  featured?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-2xl px-4 py-4 text-sm font-black transition ${
        featured
          ? "bg-[#e1062a] text-white hover:bg-red-500"
          : active
          ? "bg-white text-black"
          : "bg-white/[0.05] text-white/70 hover:bg-white hover:text-black"
      }`}
    >
      {label}
    </Link>
  );
}