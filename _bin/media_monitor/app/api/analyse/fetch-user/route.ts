import { NextResponse } from "next/server";
import { ingestTweetsForUser } from "@/pipeline/ingestTweets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const maxPages = body.maxPages ? Number(body.maxPages) : undefined;
    
    console.info(JSON.stringify({ event: "user_ingest_start", username, maxPages, timestamp: new Date().toISOString() }));

    // Start background ingestion
    ingestTweetsForUser(username, maxPages).catch((err) => {
      console.error(JSON.stringify({ 
        event: "user_ingest_error", 
        error: err instanceof Error ? err.message : String(err), 
        timestamp: new Date().toISOString() 
      }));
    });
    
    // Return immediately so the API route doesn't timeout after 120s
    return NextResponse.json({ message: "Ingestion started", status: "processing" }, { status: 202 });
  } catch (error) {
    console.error(JSON.stringify({ 
      event: "user_ingest_error", 
      error: error instanceof Error ? error.message : String(error), 
      timestamp: new Date().toISOString() 
    }));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start ingest" },
      { status: 500 }
    );
  }
}
