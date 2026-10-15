import { NextResponse } from "next/server";
import { ingestTweetsForUser } from "@/pipeline/ingestTweets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    
    console.info(JSON.stringify({ event: "user_topup_start", username, timestamp: new Date().toISOString() }));

    // Start background ingestion with topUpOnly: true
    ingestTweetsForUser(username, 30, { topUpOnly: true }).catch((err) => {
      console.error(JSON.stringify({ 
        event: "user_topup_error", 
        error: err instanceof Error ? err.message : String(err), 
        timestamp: new Date().toISOString() 
      }));
    });
    
    // Return immediately so the API route doesn't timeout after 120s
    return NextResponse.json({ message: "Top-up started", status: "processing" }, { status: 202 });
  } catch (error) {
    console.error(JSON.stringify({ 
      event: "user_topup_error", 
      error: error instanceof Error ? error.message : String(error), 
      timestamp: new Date().toISOString() 
    }));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start top-up" },
      { status: 500 }
    );
  }
}
