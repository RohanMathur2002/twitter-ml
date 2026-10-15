import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { activeIngestControllers } from "@/pipeline/ingestTweets";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body.username || "").replace("@", "").trim();
    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    // 1. Abort any active in-memory AbortController
    const controller = activeIngestControllers.get(username.toLowerCase());
    if (controller) {
      controller.abort();
    }

    // 2. Update processing_jobs table to mark active jobs for this user as cancelled
    const result = await query(
      `
        UPDATE processing_jobs
        SET status = 'cancelled',
            completed_at = now(),
            error = 'Job stopped by user'
        WHERE job_type IN ('nitter_user_ingest', 'nitter_replies_ingest')
          AND status = 'running'
          AND lower(metadata->>'username') = lower($1)
        RETURNING id
      `,
      [username]
    );

    return NextResponse.json({
      success: true,
      message: `Cancelled ${result.rows.length} active job(s) for @${username}.`,
      cancelledJobIds: result.rows.map((r: any) => r.id),
    });
  } catch (error: any) {
    console.error("Error stopping fetch:", error);
    return NextResponse.json({ error: error.message || "Failed to stop fetch job" }, { status: 500 });
  }
}
