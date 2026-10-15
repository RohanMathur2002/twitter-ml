import { NextResponse } from "next/server";
import {
  bookmarkProfileTweet,
  removeBookmarkProfileTweet,
  getBookmarkedProfileTweetIds,
} from "@/services/tweetService";

export const dynamic = "force-dynamic";

// GET /api/tweet/profile-bookmark?username=<username>
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username");
    if (!username) return NextResponse.json({ bookmarks: [] });
    const bookmarks = await getBookmarkedProfileTweetIds(username);
    return NextResponse.json({ bookmarks });
  } catch (error) {
    console.error("[Profile Bookmark API] GET error:", error);
    return NextResponse.json({ bookmarks: [] });
  }
}

// POST /api/tweet/profile-bookmark
// Body: { tweetId, username, action: 'add' | 'remove' }
export async function POST(request: Request) {
  try {
    const { tweetId, username, action } = await request.json();

    if (!tweetId || !action) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    if (action === "add") {
      if (!username) {
        return NextResponse.json(
          { error: "username required when adding a bookmark" },
          { status: 400 }
        );
      }
      await bookmarkProfileTweet(tweetId, username);
    } else if (action === "remove") {
      await removeBookmarkProfileTweet(tweetId);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Profile Bookmark API] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
