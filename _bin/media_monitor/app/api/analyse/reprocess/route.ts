import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { processTweet } from "@/services/tweetParser";
import { upsertTweets } from "@/services/tweetService";
import { refreshProfileAnalysis } from "@/services/analysisService";
import { refreshHashtagStats } from "@/services/hashtagService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").replace("@", "").trim();
    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    console.info(JSON.stringify({ event: "reprocess_start", username, timestamp: new Date().toISOString() }));

    const profileResult = await query<{ id: number }>(
      "SELECT id FROM profiles WHERE lower(username) = lower($1) LIMIT 1",
      [username]
    );

    const profileId = profileResult.rows[0]?.id;
    if (!profileId) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Fetch all tweets for this profile
    const tweetsResult = await query<{ raw_tweet_json: any }>(
      "SELECT raw_tweet_json FROM tweets WHERE profile_id = $1",
      [profileId]
    );

    const rawTweets = tweetsResult.rows.map(r => r.raw_tweet_json);
    console.info(`[Reprocess] Found ${rawTweets.length} tweets to reprocess for ${username}`);
    const processedTweets = rawTweets.map(processTweet);

    // Verify at least one date
    if (processedTweets.length > 0) {
      console.info(`[Reprocess] Sample date after parsing: ${processedTweets[0].createdAt.toISOString()}`);
    }

    await transaction(async (client) => {
      await upsertTweets(client, profileId, processedTweets, { waitForEmbeddings: true });
      await refreshHashtagStats(client, profileId, processedTweets);
      await refreshProfileAnalysis(client, profileId);
    });

    console.info(JSON.stringify({ event: "reprocess_success", username, count: processedTweets.length, timestamp: new Date().toISOString() }));

    return NextResponse.json({ success: true, count: processedTweets.length });
  } catch (error) {
    console.error(JSON.stringify({ 
      event: "reprocess_error", 
      error: error instanceof Error ? error.message : String(error), 
      timestamp: new Date().toISOString() 
    }));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reprocess user data" },
      { status: 500 }
    );
  }
}
