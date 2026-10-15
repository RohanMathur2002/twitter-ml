import { NextResponse } from "next/server";
import { getNitterTweetDetails } from "@/services/nitterService";
import { getThreadFromDB, upsertThreadAndAnalyzeBackground } from "@/services/threadAnalysisService";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tweetId = searchParams.get("id") || "";
    const username = searchParams.get("username") || "";
    const force = searchParams.get("force") === "true";

    if (!tweetId) {
      return NextResponse.json({ error: "Missing required 'id' parameter" }, { status: 400 });
    }

    console.info(
      JSON.stringify({
        event: "tweet_details_fetch_start",
        tweetId,
        username,
        force,
        timestamp: new Date().toISOString(),
      })
    );

    let result = force ? null : await getThreadFromDB(tweetId);

    if (!result) {
      console.info(`[tweet_details_fetch] Thread not in DB or force refresh requested, fetching from Nitter: ${tweetId}`);
      result = await getNitterTweetDetails(tweetId, username);
      
      // Query database for existing bookmarks in this thread
      const dbBookmarks = await query(
        `SELECT id FROM thread_tweets WHERE root_tweet_id = $1 AND is_bookmarked = true`,
        [tweetId]
      );
      const bookmarkedIds = new Set(dbBookmarks.rows.map((r: any) => r.id));

      // Tag scraped tweets with their existing bookmark status
      if (result.mainTweet && bookmarkedIds.has(result.mainTweet.id)) {
        (result.mainTweet as any).isBookmarked = true;
      }
      if (result.replies) {
        for (const reply of result.replies) {
          if (bookmarkedIds.has(reply.id)) {
            (reply as any).isBookmarked = true;
          }
        }
      }

      // Cache in DB and trigger ML in background (fire-and-forget)
      upsertThreadAndAnalyzeBackground(tweetId, result).catch((err: unknown) => {
        console.warn("[tweet_details_fetch] Background upsert failed:", err instanceof Error ? err.message : String(err));
      });
    } else {
      console.info(`[tweet_details_fetch] Thread loaded from DB: ${tweetId} (${result.replies.length} replies)`);
    }

    console.info(
      JSON.stringify({
        event: "tweet_details_fetch_success",
        tweetId,
        username,
        replyCount: result.replies.length,
        source: result ? "db" : "nitter",
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "tweet_details_fetch_error",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch tweet details" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tweetId = searchParams.get("id") || "";

    if (!tweetId) {
      return NextResponse.json({ error: "Missing required 'id' parameter" }, { status: 400 });
    }

    console.info(`[DELETE /api/analyse/tweet] Deleting replies for root tweet: ${tweetId}`);

    // Delete replies from thread_tweets
    const deleteResult = await query(
      `DELETE FROM thread_tweets WHERE root_tweet_id = $1 AND type = 'reply'`,
      [tweetId]
    );

    // Reset or delete the analysis for this thread
    await query(
      `DELETE FROM tweet_thread_analysis WHERE root_tweet_id = $1`,
      [tweetId]
    );

    console.info(`[DELETE /api/analyse/tweet] Successfully deleted ${deleteResult.rowCount} replies for tweet: ${tweetId}`);

    return NextResponse.json({ success: true, deletedCount: deleteResult.rowCount });
  } catch (error) {
    console.error(`[DELETE /api/analyse/tweet] Error deleting replies:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete replies" },
      { status: 500 }
    );
  }
}
