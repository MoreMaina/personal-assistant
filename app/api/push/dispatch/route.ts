import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { dispatchDuePushNotifications } from "@/lib/server/pushDispatcher";


function hasValidDispatchSecret(request: Request): boolean {
  const expected = process.env.PUSH_DISPATCH_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const received = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export async function POST(request: Request) {
  if (!process.env.PUSH_DISPATCH_SECRET?.trim()) {
    return NextResponse.json(
      { error: "Push dispatch is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!hasValidDispatchSecret(request)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const stats = await dispatchDuePushNotifications();

    return NextResponse.json(
      { ok: true, stats },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Push dispatch failed. Check server configuration and logs." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
