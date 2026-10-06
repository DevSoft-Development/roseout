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
  const showSharedPublicChrome = isPublicBusinessPath(pathname);

  return (
    <>
      {showSharedPublicChrome ? <TheOutHavenHeader surface="business" /> : null}
      {children}
      {showSharedPublicChrome ? <TheOutHavenFooter /> : null}
    </>
  );
}
