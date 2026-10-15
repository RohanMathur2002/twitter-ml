import { NextResponse } from "next/server";
import { getTweetsForProfile } from "@/services/tweetService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username") || "";
    const page = Number(searchParams.get("page") || 1);
    const limit = Number(searchParams.get("limit") || 25);
    const fromDate = searchParams.get("fromDate") || undefined;
    const toDate = searchParams.get("toDate") || undefined;
    const sortOrder = (searchParams.get("sort") === "asc" ? "asc" : "desc") as "asc" | "desc";
    
    console.info(JSON.stringify({ event: "tweets_fetch_start", username, page, limit, fromDate, toDate, sortOrder, timestamp: new Date().toISOString() }));

    const result = await getTweetsForProfile(username, page, limit, fromDate, toDate, sortOrder);

    console.info(JSON.stringify({ event: "tweets_fetch_success", username, page, count: result.tweets.length, total: result.total, timestamp: new Date().toISOString() }));
    return NextResponse.json(result);
  } catch (error) {
    console.error(JSON.stringify({ 
      event: "tweets_fetch_error", 
      error: error instanceof Error ? error.message : String(error), 
      timestamp: new Date().toISOString() 
    }));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read tweets" },
      { status: 500 }
    );
  }
}
