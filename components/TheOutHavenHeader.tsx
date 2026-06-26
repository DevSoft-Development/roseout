"use client";

import type { User } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

const navItems = [
  { href: "/explore", label: "Explore" },
  { href: "/create", label: "Create Outing" },
  { href: "/business", label: "For Businesses" },
];

type AuthMeResponse = {
  user?: { email?: string | null; name?: string | null } | null;
  isAdmin?: boolean;
};

function getMetadataString(user: User | null, key: string) {
  const value = user?.user_metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getDisplayName(user: User | null, profileName: string | null) {
  return (
    profileName ||
    getMetadataString(user, "full_name") ||
    getMetadataString(user, "name") ||
    "Account"
  );
}

function getInitials(value: string) {
  const cleanValue = value.trim();
  if (!cleanValue) return "A";

  const namePart = cleanValue.includes("@")
    ? cleanValue.split("@")[0]
    : cleanValue;
  const words = namePart.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  return initials || cleanValue[0]?.toUpperCase() || "A";
}

export default function TheOutHavenHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const safePathname = pathname || "";
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const displayName = useMemo(
    () => getDisplayName(user, profileName),
    [user, profileName],
  );
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadAuth() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!active) return;
      setUser(currentUser);
      setAuthLoaded(true);

      if (!currentUser) {
        setProfileName(null);
        setIsAdmin(false);
        return;
      }

      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as AuthMeResponse;
        setProfileName(payload.user?.name || null);
        setIsAdmin(Boolean(payload.isAdmin));
      } catch {
        if (active) setIsAdmin(false);
      }
    }

    void loadAuth();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setAuthLoaded(true);
      setAccountDropdownOpen(false);
      if (!session?.user) {
        setProfileName(null);
        setIsAdmin(false);
        return;
      }
      void loadAuth();
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

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
    setAccountDropdownOpen(false);
  }, [safePathname]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountDropdownOpen(false);
      }
    }

    if (accountDropdownOpen) {
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("touchstart", handlePointerDown);
    }

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [accountDropdownOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountDropdownOpen(false);
    }

    if (accountDropdownOpen) document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountDropdownOpen]);

  function isActive(href: string) {
    return (
      safePathname === href || (href !== "/" && safePathname.startsWith(href))
    );
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfileName(null);
    setIsAdmin(false);
    setAccountDropdownOpen(false);
    setMenuOpen(false);

    if (
      safePathname.startsWith("/user/dashboard") ||
      safePathname.startsWith("/admin")
    ) {
      router.push("/login");
    } else {
      router.push("/");
    }
    router.refresh();
  }

  function toggleMobileMenu() {
    setAccountDropdownOpen(false);
    setMenuOpen((open) => !open);
  }

  const signedIn = authLoaded && Boolean(user);

  return (
    <header
      className={
        scrolled || menuOpen
          ? "fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/95 text-white shadow-lg shadow-black/40 backdrop-blur-xl transition-all duration-300"
          : "fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/95 text-white backdrop-blur-xl transition-all duration-300"
      }
    >
      <div
        className={
          scrolled
            ? "mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 transition-all duration-300 sm:px-6"
            : "mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 transition-all duration-300 sm:px-6"
        }
      >
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3"
          aria-label="TheOutHaven home"
        >
          <span
            className={
              scrolled
                ? "relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15 transition-all duration-300"
                : "relative flex h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15 transition-all duration-300"
            }
          >
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
              className={
                isActive(item.href)
                  ? "relative text-sm font-black text-white transition"
                  : "relative text-sm font-black text-white/45 transition hover:text-white"
              }
            >
              {item.label}
              <span
                className={
                  isActive(item.href)
                    ? "absolute -bottom-1 left-0 h-[2px] w-full bg-[#e1062a] transition-all duration-300"
                    : "absolute -bottom-1 left-0 h-[2px] w-0 bg-[#e1062a] transition-all duration-300"
                }
              />
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {!signedIn ? (
            <>
              <Link
                href="/login"
                className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-black text-white transition hover:border-white/25 hover:bg-white hover:text-black"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-[#e1062a] px-6 py-3 text-sm font-black text-white transition hover:bg-red-500"
              >
                Get Started
              </Link>
            </>
          ) : (
            <div ref={accountMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setAccountDropdownOpen((open) => !open)}
                className="flex max-w-[250px] items-center gap-3 rounded-full border border-white/15 bg-white/[0.06] py-2 pl-2 pr-4 text-sm font-black text-white transition hover:border-[#e1062a]/60 hover:bg-white/[0.1]"
                aria-haspopup="menu"
                aria-expanded={accountDropdownOpen}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e1062a] text-xs font-black text-white">
                  {initials}
                </span>
                <span className="truncate">{displayName}</span>
                <span className="text-white/50">⌄</span>
              </button>
              {accountDropdownOpen && (
                <div className="absolute right-0 z-50 mt-3 w-72 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl">
                  <div className="border-b border-white/10 px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-300">Signed in as</p>
                    <p className="mt-1 truncate text-sm font-black text-white">{displayName}</p>
                    {user?.email ? <p className="truncate text-xs font-bold text-white/50">{user.email}</p> : null}
                  </div>
                  <div className="py-2">
                    {[
                      ["/user/dashboard", "Dashboard"],
                      ["/user/dashboard/beta/weekly", "Beta Weekly Tasks"],
                      ["/user/dashboard/saved", "Saved Outings"],
                      ["/user/dashboard/account", "Account Settings"],
                      ["/help", "Get Help"],
                    ].map(([href, label]) => (
                      <Link key={href} href={href} className="block rounded-2xl px-4 py-3 text-sm font-black text-white/75 transition hover:bg-white/10 hover:text-white">
                        {label}
                      </Link>
                    ))}
                    {isAdmin && (
                      <Link href="/admin/dashboard" className="block rounded-2xl px-4 py-3 text-sm font-black text-white/75 transition hover:bg-white/10 hover:text-white">
                        Admin Dashboard
                      </Link>
                    )}
                  </div>
                  <div className="border-t border-white/10 p-2">
                    <button type="button" onClick={handleSignOut} className="block w-full rounded-2xl px-4 py-3 text-left text-sm font-black text-rose-200 transition hover:bg-[#e1062a]/15 hover:text-rose-100">
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleMobileMenu}
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
                className={
                  isActive(item.href)
                    ? "block rounded-2xl bg-white px-4 py-4 text-sm font-black text-black transition"
                    : "block rounded-2xl bg-white/[0.05] px-4 py-4 text-sm font-black text-white/70 transition hover:bg-white hover:text-black"
                }
              >
                {item.label}
              </Link>
            ))}

            {!signedIn ? (
              <>
                <Link
                  href="/login"
                  className="block rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-4 text-sm font-black text-white transition hover:bg-white hover:text-black"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="block rounded-2xl bg-[#e1062a] px-4 py-4 text-sm font-black text-white transition hover:bg-red-500"
                >
                  Get Started
                </Link>
              </>
            ) : (
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e1062a] text-xs font-black text-white">
                    {initials}
                  </span>
                  <span className="min-w-0 truncate text-sm font-black text-white">
                    {displayName}
                  </span>
                </div>
                <Link
                  href="/user/dashboard"
                  className="block rounded-2xl bg-white/[0.05] px-4 py-4 text-sm font-black text-white/70 transition hover:bg-white hover:text-black"
                >
                  Dashboard
                </Link>
                {[
                  ["/user/dashboard/beta/weekly", "Beta Weekly Tasks"],
                  ["/user/dashboard/saved", "Saved Outings"],
                  ["/user/dashboard/account", "Account Settings"],
                  ["/help", "Get Help"],
                ].map(([href, label]) => (
                  <Link key={href} href={href} className="block rounded-2xl bg-white/[0.05] px-4 py-4 text-sm font-black text-white/70 transition hover:bg-white hover:text-black">
                    {label}
                  </Link>
                ))}
                {isAdmin && (
                  <Link
                    href="/admin/dashboard"
                    className="block rounded-2xl bg-white/[0.05] px-4 py-4 text-sm font-black text-white/70 transition hover:bg-white hover:text-black"
                  >
                    Admin Dashboard
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="block w-full rounded-2xl bg-[#e1062a] px-4 py-4 text-left text-sm font-black text-white transition hover:bg-red-500"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
