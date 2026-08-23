"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminPortalLoginLink() {
  const pathname = usePathname();
  if (pathname !== "/login") return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] sm:bottom-6 sm:right-6">
      <Link
        href="/admin/login?autostart=1"
        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#17100d]/95 px-4 py-2.5 text-xs font-bold text-white shadow-2xl shadow-black/40 backdrop-blur transition hover:border-[#e1062a]/60 hover:bg-[#221713]"
      >
        <span className="grid h-4 w-4 grid-cols-2 gap-[1px]" aria-hidden="true">
          <span className="bg-[#f25022]" />
          <span className="bg-[#7fba00]" />
          <span className="bg-[#00a4ef]" />
          <span className="bg-[#ffb900]" />
        </span>
        Sign in to Admin Portal
      </Link>
    </div>
  );
}
