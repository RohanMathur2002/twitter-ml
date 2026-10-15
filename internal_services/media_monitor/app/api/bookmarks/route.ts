import { NextResponse } from "next/server";
import { getBookmarksForRoot, getAllBookmarkedProfileTweets } from "@/services/tweetService";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/bookmarks
// Returns all bookmarks from both sources:
//   - thread_tweets (tweet page) — is_bookmarked = true
//   - bookmarked_profile_tweets (profile page)
export async function GET() {
  try {
    // 1. Thread tweet bookmarks (from /tweet page)
    const threadResult = await query(
      `
        SELECT tt.id, tt.root_tweet_id, tt.type, tt.username, tt.display_name,
               tt.profile_image_url, tt.raw_text, tt.created_at,
               tt.likes_count, tt.retweets_count, tt.replies_count, tt.views_count,
               'thread' AS source
        FROM thread_tweets tt
        WHERE tt.is_bookmarked = true
        ORDER BY tt.fetched_at DESC
      `
    );

    // 2. Profile tweet bookmarks
    const profileResult = await query(
      `
        SELECT bpt.tweet_id AS id, bpt.username, bpt.bookmarked_at,
               t.raw_text, t.created_at, t.likes_count, t.retweets_count,
               t.replies_count, t.views_count, t.is_retweet,
               'profile' AS source
        FROM bookmarked_profile_tweets bpt
        LEFT JOIN tweets t ON t.id = bpt.tweet_id
        ORDER BY bpt.bookmarked_at DESC
      `
    );

    return NextResponse.json({
      threadBookmarks: threadResult.rows,
      profileBookmarks: profileResult.rows,
    });
  } catch (error) {
    console.error("[Bookmarks API] Error:", error);
    return NextResponse.json(
      { error: "Failed to load bookmarks" },
      { status: 500 }
    );
  }
}
