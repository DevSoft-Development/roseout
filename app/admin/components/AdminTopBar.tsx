"use client";

import type React from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type SearchResult = {
  type: "user" | "location";
  locationType?: "restaurants" | "activities";
  id: string;
  title: string;
  subtitle: string;
  meta: string;
};

type NavLink = { label: string; href: string; visible: boolean; external?: boolean; neverActive?: boolean };

export default function AdminTopBar() {
  const supabase = createClient();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const currentUser = data.user;
      setUser(currentUser);
      if (currentUser?.email) {
        const { data: adminUser } = await supabase
          .from("admin_users")
          .select("role")
          .eq("email", currentUser.email.toLowerCase())
          .maybeSingle();
        setRole(adminUser?.role || currentUser.user_metadata?.role || null);
      }
    })();
  }, [supabase]);

  useEffect(() => {
    const cleanQuery = query.trim();
    if (!showUserSearch || cleanQuery.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(cleanQuery)}`);
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, showUserSearch]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowUserSearch(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const canView = ["superuser", "admin", "editor", "viewer"].includes(role || "");
  const canViewUsers = ["superuser", "admin"].includes(role || "");

  const links: NavLink[] = useMemo(
    () => [
      { label: "Dashboard", href: "/admin/dashboard", visible: canView },
      { label: "Locations", href: "/admin/dashboard/locations", visible: canView },
      { label: "Users", href: "/admin/dashboard/users", visible: canViewUsers },
      { label: "Reservations", href: "/admin/dashboard/reservations", visible: canView },
      { label: "Reviews", href: "/admin/dashboard/reviews", visible: canView },
      { label: "Communication", href: "/admin/dashboard/communication", visible: canView },
      { label: "Settings", href: "/admin/dashboard/settings", visible: canView },
      { label: "View Site", href: "/", visible: canView, external: true, neverActive: true },
    ],
    [canView, canViewUsers],
  );

  const visibleLinks = links.filter((link) => link.visible);

  const goTo = (p: string) => {
    setOpen(false);
    setShowUserSearch(false);
    window.location.href = p;
  };

  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || "Admin";

  return (
    <header className="sticky top-0 z-[100] border-b border-white/10 bg-[#090706]/95 text-white shadow-2xl backdrop-blur-2xl">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => goTo("/admin/dashboard")}
          className="group flex min-w-0 items-center gap-3"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rose-300/30 bg-gradient-to-br from-rose-200 to-amber-200 text-lg font-black text-[#6f102a] shadow-xl">
            R
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-lg font-black tracking-tight text-white">TheOutHaven</p>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-rose-200/70">Admin</p>
          </div>
        </button>

        <nav className="hidden items-center gap-2 lg:flex" aria-label="Admin sections">
          {visibleLinks.map((link) => {
            const isActive =
              !link.neverActive && (pathname === link.href || pathname?.startsWith(`${link.href}/`));

            return (
              <Link
                key={link.label}
                href={link.href}
                className={`inline-flex items-center gap-1 rounded-full border px-4 py-2 text-sm font-bold transition-all duration-150 ${
                  isActive
                    ? "border-rose-300/40 bg-gradient-to-r from-rose-900/45 to-amber-900/35 text-rose-100 shadow-[0_10px_30px_rgba(120,35,60,0.35)]"
                    : "border-white/10 bg-[#120d0b] text-white/70 hover:border-rose-300/30 hover:text-white"
                }`}
              >
                {link.label}
                {link.external && <ExternalLink className="h-3.5 w-3.5" />}
              </Link>
            );
          })}
        </nav>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm"
          >
            {name}
          </button>
          {open && (
            <div className="absolute right-0 z-[9999] mt-3 w-[calc(100vw-2rem)] max-w-[24rem] rounded-2xl border border-white/10 bg-[#120d0b] p-3">
              <div className="grid gap-1">
                {visibleLinks.map((link) => (
                  <Link
                    onClick={() => setOpen(false)}
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between rounded-lg px-2 py-2 text-sm text-white/80 hover:bg-white/10"
                  >
                    <span>{link.label}</span>
                    {link.external && <ExternalLink className="h-3.5 w-3.5" />}
                  </Link>
                ))}
              </div>
              {canViewUsers && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowUserSearch((p) => !p)}
                    className="w-full rounded-xl bg-rose-500/20 px-3 py-2 text-left text-sm font-bold"
                  >
                    View as User or Location
                  </button>
                  {showUserSearch && (
                    <div className="mt-2">
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search..."
                        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
                      />
                      {searching && <p className="mt-2 text-xs text-white/50">Searching...</p>}
                      {results.map((item) => (
                        <button
                          key={item.id}
                          disabled={Boolean(impersonatingId)}
                          className="mt-2 w-full rounded-lg border border-white/10 px-3 py-2 text-left text-xs"
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/login";
                }}
                className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-sm"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
