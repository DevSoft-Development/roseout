import { NextResponse } from "next/server";

type GuardError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

export function fraudGuardResponse(error: unknown, fallback = "This action is temporarily unavailable.") {
  const value = (error || {}) as GuardError;
  const message = `${value.message || ""} ${value.details || ""}`.trim();
  const isGuard = value.code === "42501" || message.includes("fraud_review_required:") || message.includes("fraud_velocity_block:");
  if (!isGuard) return null;

  if (message.includes("fraud_velocity_block:")) {
    return NextResponse.json(
      {
        error: "Too many attempts were made in a short period. Try again later.",
        code: "fraud_velocity_limited",
      },
      {
        status: 429,
        headers: { "Retry-After": "900" },
      },
    );
  }

  return NextResponse.json(
    {
      error: fallback,
      code: "fraud_review_required",
    },
    { status: 409 },
  );
}
