"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function CrmWorkspaceShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isPlainCrmRoot = pathname === "/admin/dashboard/crm" && !searchParams.get("q");

  useEffect(() => {
    if (isPlainCrmRoot) router.replace("/admin/dashboard/crm/today");
  }, [isPlainCrmRoot, router]);

  if (isPlainCrmRoot) return null;

  return <section className="min-w-0 space-y-5">{children}</section>;
}
