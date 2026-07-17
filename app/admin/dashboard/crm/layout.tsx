import type { ReactNode } from "react";
import CrmListNavigationMemory from "./CrmListNavigationMemory";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CrmListNavigationMemory />
      {children}
    </>
  );
}
