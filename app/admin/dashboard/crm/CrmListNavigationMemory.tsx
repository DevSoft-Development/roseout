"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const CRM_LIST_PATH = "/admin/dashboard/crm";
const URL_KEY = "theouthaven:admin-crm:return-url";
const SCROLL_KEY = "theouthaven:admin-crm:scroll-y";

function currentUrl(pathname: string, search: string) {
  return search ? `${pathname}?${search}` : pathname;
}

export default function CrmListNavigationMemory() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const search = searchParams.toString();

  useEffect(() => {
    if (pathname !== CRM_LIST_PATH) return;

    const url = currentUrl(pathname, search);
    sessionStorage.setItem(URL_KEY, url);

    const savedUrl = sessionStorage.getItem(URL_KEY);
    const savedScroll = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
    if (savedUrl === url && savedScroll > 0) {
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: savedScroll })));
    }

    const rememberScroll = () => sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => {
      rememberScroll();
      window.removeEventListener("scroll", rememberScroll);
    };
  }, [pathname, search]);

  useEffect(() => {
    if (!pathname.startsWith(`${CRM_LIST_PATH}/`)) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest("a");
      if (!anchor) return;

      const href = new URL(anchor.href, window.location.origin);
      if (href.pathname !== CRM_LIST_PATH || href.search) return;

      event.preventDefault();
      const returnUrl = sessionStorage.getItem(URL_KEY) || CRM_LIST_PATH;
      router.push(returnUrl, { scroll: false });
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname, router]);

  return null;
}
