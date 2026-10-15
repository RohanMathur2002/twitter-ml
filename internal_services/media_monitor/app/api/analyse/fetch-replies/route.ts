import { NextResponse } from "next/server";
import { ingestRepliesForUser } from "@/pipeline/ingestTweets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const fetchUntilDate = body.fetchUntilDate ? String(body.fetchUntilDate).trim() : undefined;
    
    console.info(JSON.stringify({ event: "replies_ingest_start", username, fetchUntilDate, timestamp: new Date().toISOString() }));

    // Start background ingestion
    ingestRepliesForUser(username, { fetchUntilDate }).catch((err) => {
      console.error(JSON.stringify({ 
        event: "replies_ingest_error", 
        error: err instanceof Error ? err.message : String(err), 
        timestamp: new Date().toISOString() 
      }));
    });
    
    // Return immediately so the API route doesn't timeout
    return NextResponse.json({ message: "Replies ingestion started", status: "processing" }, { status: 202 });
  } catch (error) {
    console.error(JSON.stringify({ 
      event: "replies_ingest_error", 
      error: error instanceof Error ? error.message : String(error), 
      timestamp: new Date().toISOString() 
    }));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start replies ingest" },
      { status: 500 }
    );
  }
}
