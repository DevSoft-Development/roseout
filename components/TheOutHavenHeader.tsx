"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/create", label: "Create Outing" },
  { href: "/business", label: "Business" },
];

export default function TheOutHavenHeader() {
  const pathname = usePathname();
  const safePathname = pathname || "";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 10);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [safePathname]);

  function isActive(href: string) {
    return safePathname === href || (href !== "/" && safePathname.startsWith(href));
  }

  return (
    <header className={scrolled || menuOpen ? "fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/95 text-white shadow-lg shadow-black/40 backdrop-blur-xl transition-all duration-300" : "fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/95 text-white backdrop-blur-xl transition-all duration-300"}>
      <div className={scrolled ? "mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 transition-all duration-300 sm:px-6" : "mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 transition-all duration-300 sm:px-6"}>
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="TheOutHaven home">
          <span className={scrolled ? "relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15 transition-all duration-300" : "relative flex h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15 transition-all duration-300"}>
            <Image
              src="/toh_logo.png"
              alt="TheOutHaven logo"
              fill
              sizes={scrolled ? "36px" : "44px"}
              priority
              className="object-contain"
            />
          </span>

          <span className="truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
            TheOutHaven
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(item.href) ? "relative text-sm font-black text-white transition" : "relative text-sm font-black text-white/45 transition hover:text-white"}
            >
              {item.label}
              <span className={isActive(item.href) ? "absolute -bottom-1 left-0 h-[2px] w-full bg-[#e1062a] transition-all duration-300" : "absolute -bottom-1 left-0 h-[2px] w-0 bg-[#e1062a] transition-all duration-300"} />
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <Link href="/signup" className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black text-white transition hover:bg-red-500">
            Sign In
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Close mobile menu" : "Open mobile menu"}
          aria-expanded={menuOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white transition hover:bg-white hover:text-black md:hidden"
        >
          <span className="text-xl font-black">{menuOpen ? "×" : "☰"}</span>
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-white/10 bg-black/95 px-4 pb-5 pt-3 shadow-2xl shadow-black/50 backdrop-blur-xl md:hidden">
          <div className="mx-auto max-w-7xl space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(item.href) ? "block rounded-2xl bg-white px-4 py-4 text-sm font-black text-black transition" : "block rounded-2xl bg-white/[0.05] px-4 py-4 text-sm font-black text-white/70 transition hover:bg-white hover:text-black"}
              >
                {item.label}
              </Link>
            ))}

            <Link href="/signup" className="block rounded-2xl bg-[#e1062a] px-4 py-4 text-sm font-black text-white transition hover:bg-red-500">
              Sign In
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}