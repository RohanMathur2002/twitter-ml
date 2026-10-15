import { NextResponse } from "next/server";
import { bookmarkTweet, removeBookmarkTweet, getBookmarksForRoot } from "@/services/tweetService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rootTweetId = searchParams.get("rootTweetId");
    if (!rootTweetId) return NextResponse.json({ bookmarks: [] });
    const bookmarks = await getBookmarksForRoot(rootTweetId);
    return NextResponse.json({ bookmarks });
  } catch (error) {
    return NextResponse.json({ bookmarks: [] });
  }
}

export async function POST(request: Request) {
  try {
    const { tweetId, rootTweetId, type, action } = await request.json();

    if (!tweetId || !action) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    if (action === "add") {
      await bookmarkTweet(tweetId, rootTweetId, type);
    } else if (action === "remove") {
      await removeBookmarkTweet(tweetId);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Bookmark API] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
