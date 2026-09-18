import type { ReactNode } from "react";

import { requireAdminRole } from "@theouthaven/auth/admin-session";

export default async function SearchAnchorsAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminRole(["superadmin", "admin"]);
  return children;
}
