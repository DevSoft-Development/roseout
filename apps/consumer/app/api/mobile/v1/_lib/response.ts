import { NextResponse } from "next/server";

export const MOBILE_API_VERSION = "1";

export function mobileJson<T>(body: T, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-TheOutHaven-Mobile-API-Version", MOBILE_API_VERSION);
  return NextResponse.json(body, { ...init, headers });
}

export function mobileError(error: string, message: string, status: number) {
  return mobileJson({ ok: false, error, message }, { status });
}
