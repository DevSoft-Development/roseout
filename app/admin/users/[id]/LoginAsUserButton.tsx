"use client";

import ImpersonateButton from "@/components/admin/ImpersonateButton";

export default function LoginAsUserButton({ userId }: { userId: string }) {
  return (
    <ImpersonateButton
      userId={userId}
      targetType="user"
      label="Log in as this user"
      className="rounded-full bg-rose-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-rose-500/25 hover:bg-rose-400 disabled:opacity-50"
    />
  );
}
