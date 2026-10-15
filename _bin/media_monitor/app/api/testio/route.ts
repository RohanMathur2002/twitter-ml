import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://api.twitterapi.io";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.trim();
  const cursor = searchParams.get("cursor") ?? undefined;

  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const apiKey = process.env.TWITTERAPI_IO_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfiguration: TWITTERAPI_IO_KEY is not set." },
      { status: 500 }
    );
  }

  try {
    const query = new URLSearchParams({ query: `from:${username}` });
    if (cursor) query.set("cursor", cursor);

    const res = await fetch(`${BASE_URL}/twitter/tweet/advanced_search?${query.toString()}`, {
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      // Prevent Next.js from caching these on the server — always fresh
      cache: "no-store",
    });

    const raw = await res.json();

    if (!res.ok) {
      console.error("[testio] twitterapi.io error:", raw);
      return NextResponse.json(
        { error: raw?.message ?? `API error ${res.status}` },
        { status: res.status }
      );
    }

    // Normalize and pass through the full response
    return NextResponse.json(raw);
  } catch (err: any) {
    console.error("[testio] fetch failed:", err);
    return NextResponse.json({ error: "Failed to reach twitterapi.io." }, { status: 502 });
  }
}
