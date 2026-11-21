import { NextResponse } from "next/server";


export async function GET(request: Request) {
  // Request access keeps this endpoint request-time under Cache Components.
  void request.url;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();

  if (!publicKey) {
    return NextResponse.json(
      { error: "Push notifications are not configured on the server." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { publicKey },
    { headers: { "Cache-Control": "no-store" } },
  );
}
