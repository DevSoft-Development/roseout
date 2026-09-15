import { NextRequest, NextResponse } from "next/server";
import { CREATOR_REFERRAL_COOKIE, CREATOR_REFERRAL_DAYS, findCreatorByKey } from "@/lib/creator-partners/program";

export async function GET(request: NextRequest, { params }: { params: Promise<{ creatorKey: string }> }) {
  const { creatorKey } = await params;
  const creator = await findCreatorByKey(creatorKey);
  if (!creator) return NextResponse.redirect(new URL("/business", request.url));

  const destination = new URL(`/business/invite/${encodeURIComponent(creator.slug || creator.creator_key)}`, request.url);
  const response = NextResponse.redirect(destination, 307);
  response.cookies.set(CREATOR_REFERRAL_COOKIE, encodeURIComponent(String(creator.creator_key)), {
    maxAge: CREATOR_REFERRAL_DAYS * 24 * 60 * 60,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
