import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAllowedImageUrl(url: string) {
  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "maps.googleapis.com" ||
        parsed.hostname === "lh3.googleusercontent.com" ||
        parsed.hostname.endsWith(".googleusercontent.com"))
    );
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url || !isAllowedImageUrl(url)) {
      return NextResponse.json(
        { error: "Invalid image URL." },
        { status: 400 },
      );
    }

    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "TheOutHaven/1.0",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Image fetch failed." },
        { status: response.status },
      );
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image proxy failed." }, { status: 500 });
  }
}
