"use client";

import { useEffect } from "react";

const PASSWORD_RESET_URL = "https://www.theouthaven.com/reset-password";

export default function RecoveryRedirect() {
  useEffect(() => {
    const hash = window.location.hash;

    if (!hash) return;

    const hashParams = new URLSearchParams(hash.slice(1));
    const isRecoveryLink = hashParams.get("type") === "recovery";
    const hasAccessToken = Boolean(hashParams.get("access_token"));

    if (!isRecoveryLink || !hasAccessToken) return;

    window.location.replace(`${PASSWORD_RESET_URL}${hash}`);
  }, []);

  return null;
}
