import type { ReactNode } from "react";

export default function ReserveShell({ children }: { children: ReactNode }) {
  return <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-[1500px] space-y-5">{children}</div></main>;
}
