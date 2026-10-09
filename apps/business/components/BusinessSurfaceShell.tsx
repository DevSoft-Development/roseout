"use client";

import { usePathname } from "next/navigation";
import TheOutHavenFooter from "@/components/TheOutHavenFooter";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

function isPublicBusinessPath(pathname: string) {
  if (pathname === "/business") return true;
  if (pathname.startsWith("/business/plans")) return true;
  if (pathname.startsWith("/business/claim")) return true;
  return false;
}

export default function BusinessSurfaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const showSharedHeader = isPublicBusinessPath(pathname);
  const showSharedFooter = showSharedHeader || pathname.startsWith("/business/login");

  return (
    <>
      {showSharedHeader ? <TheOutHavenHeader surface="business" /> : null}
      {children}
      {showSharedFooter ? <TheOutHavenFooter /> : null}
    </>
  );
}
