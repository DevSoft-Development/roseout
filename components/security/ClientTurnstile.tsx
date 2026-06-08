"use client";

import { useEffect, useState } from "react";
import TurnstileWidget from "@/components/security/TurnstileWidget";

type Props = {
  action: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  onReady?: () => void;
  resetKey?: number | string;
  className?: string;
  theme?: "auto" | "light" | "dark";
};

export default function ClientTurnstile(props: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <TurnstileWidget {...props} />;
}
