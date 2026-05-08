import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.vercel.app";

  const res = await fetch(`${siteUrl}/api/admin/restaurants/backfill-qr`, {
    method: "GET",
    headers: {
      "x-internal-import-secret": req.headers.get("x-internal-import-secret") || "",
    },
    cache: "no-store",
  });

  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: Request) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.vercel.app";

  const res = await fetch(`${siteUrl}/api/admin/restaurants/backfill-qr`, {
    method: "POST",
    headers: {
      "x-internal-import-secret": req.headers.get("x-internal-import-secret") || "",
    },
    cache: "no-store",
  });

  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}