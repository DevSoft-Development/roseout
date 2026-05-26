"use client";
import { getPasswordChecks } from "@/lib/auth/password-policy";

export function calculatePasswordStrength(password: string) {
  const checks = getPasswordChecks(password);
  const met = Object.values(checks).filter(Boolean).length;
  if (met < 3) return "weak";
  if (met === 3) return "fair";
  if (met === 4) return "good";
  return "strong";
}

export default function PasswordStrengthMeter({ password, confirmPassword }: { password: string; confirmPassword: string }) {
  const checks = getPasswordChecks(password);
  const strength = calculatePasswordStrength(password);
  return <div className="rounded-xl border border-white/10 p-3 text-sm text-white"><p className="font-bold capitalize">Strength: {strength}</p><ul className="mt-2 space-y-1 text-white/75"><li>{checks.minLength ? "✓" : "•"} At least 8 characters</li><li>{checks.uppercase ? "✓" : "•"} Uppercase letter</li><li>{checks.lowercase ? "✓" : "•"} Lowercase letter</li><li>{checks.number ? "✓" : "•"} Number</li><li>{checks.symbol ? "✓" : "•"} Symbol</li><li>{password && confirmPassword && password === confirmPassword ? "✓" : "•"} Passwords match</li></ul></div>;
}
