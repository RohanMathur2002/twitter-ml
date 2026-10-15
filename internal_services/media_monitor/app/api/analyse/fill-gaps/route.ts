import { NextResponse } from "next/server";
import { fillProfileGaps } from "@/pipeline/ingestTweets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    
    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }
    
    const gapSize = Number(body.gapSize) || 14;

    console.info(JSON.stringify({ event: "gap_fill_start", username, gapSize, timestamp: new Date().toISOString() }));

    // Start background ingestion
    fillProfileGaps(username, gapSize).catch((err) => {
      console.error(JSON.stringify({ 
        event: "gap_fill_error", 
        error: err instanceof Error ? err.message : String(err), 
        timestamp: new Date().toISOString() 
      }));
    });
    
    // Return immediately so the API route doesn't timeout
    return NextResponse.json({ message: "Gap filling started", status: "processing" }, { status: 202 });
  } catch (error) {
    console.error(JSON.stringify({ 
      event: "gap_fill_error", 
      error: error instanceof Error ? error.message : String(error), 
      timestamp: new Date().toISOString() 
    }));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start gap fill" },
      { status: 500 }
    );
  }
}
