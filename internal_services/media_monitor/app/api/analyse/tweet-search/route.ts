import { NextResponse } from "next/server";
import { searchNormalTweetsForProfile } from "@/services/tweetService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mlApiUrl = process.env.ML_FASTAPI_URL || "http://127.0.0.1:8000";

    console.info(
      JSON.stringify({
        event: "tweet_similarity_search_start",
        username: body.username || "",
        query: body.query || "",
        limit: body.limit || 10,
        timestamp: new Date().toISOString(),
      })
    );

    if (body.mode === "normal") {
      const results = await searchNormalTweetsForProfile(body.username, body.query, body.limit);
      console.info(
        JSON.stringify({
          event: "tweet_normal_search_success",
          count: results.length,
          timestamp: new Date().toISOString(),
        })
      );
      return NextResponse.json({ results, count: results.length });
    }

    const response = await fetch(`${mlApiUrl}/tweets/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: payload.error || payload.detail || "Similarity search failed" },
        { status: response.status }
      );
    }

    console.info(
      JSON.stringify({
        event: "tweet_similarity_search_success",
        count: payload.count || 0,
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(payload);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "tweet_similarity_search_error",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Similarity search failed" },
      { status: 500 }
    );
  }
}
