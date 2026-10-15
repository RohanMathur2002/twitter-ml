import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const result = await query(`
      DELETE FROM thread_tweets
      WHERE is_bookmarked = false
      AND root_tweet_id NOT IN (
        SELECT DISTINCT root_tweet_id FROM thread_tweets WHERE is_bookmarked = true
      )
      AND (
        (fetch_count <= 5 AND fetched_at < NOW() - INTERVAL '12 hours')
        OR 
        (fetch_count > 5 AND fetched_at < NOW() - INTERVAL '3 days')
      )
      RETURNING id;
    `);

    // Clean up analysis placeholders where all related thread rows for root are gone
    await query(`
      DELETE FROM tweet_thread_analysis tta
      WHERE NOT EXISTS (
        SELECT 1 FROM thread_tweets tt WHERE tt.root_tweet_id = tta.root_tweet_id
      )
    `);

    console.info(`[Cron] Cleanup complete. Deleted ${result.rowCount} expired cached thread tweets.`);

    return NextResponse.json({ success: true, deleted: result.rowCount });
  } catch (error) {
    console.error("[Cron] Cleanup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
