import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { DbTweet } from "@/services/tweetService";

export const dynamic = "force-dynamic";

// Regex patterns for text cleaning
const URL_PATTERN = /https?:\/\/[^\s]+|(?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;
const HASHTAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;
const MENTION_PATTERN = /@([A-Za-z0-9_]{1,20})/g;

function splitCamelCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function cleanTextString(rawText: string): string {
  if (!rawText) return "";

  // Extract hashtags to append their split/semantic forms at the end
  const hashtags = Array.from(rawText.matchAll(HASHTAG_PATTERN), (match) => match[1].toLowerCase());
  const hashtagSemanticText = hashtags.map(splitCamelCase).join(" ");

  const clean = `${rawText.replace(URL_PATTERN, " ")} ${hashtagSemanticText}`
    .replace(HASHTAG_PATTERN, "$1")
    .replace(MENTION_PATTERN, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return clean;
}

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username") || "";
    const cleanUsername = username.replace("@", "").trim();

    if (!cleanUsername) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    // Fetch all tweets for this profile, including profile metadata
    const result = await query<
      DbTweet & {
        profile_id: number;
        profile_username: string;
        profile_fullname: string | null;
      }
    >(
      `
        SELECT 
          t.*,
          p.id AS profile_id,
          p.username AS profile_username,
          p.display_name AS profile_fullname
        FROM tweets t
        JOIN profiles p ON p.id = t.profile_id
        WHERE lower(p.username) = lower($1)
        ORDER BY t.created_at DESC
      `,
      [cleanUsername]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "No tweets found for this user" }, { status: 404 });
    }

    // Fields to include in CSV
    const headers = [
      "id",
      "tweet_id",
      "username",
      "fullname",
      "profile_id",
      "created_at",
      "raw_text",
      "clean_text",
      "quoted_text",
      "quoted_username",
      "clean_quoted_text",
      "combined_text",
      "has_quote",
      "has_media",
      "has_url",
      "word_count",
      "likes_count",
      "retweets_count",
      "replies_count",
      "views_count",
      "media",
      "urls"
    ];

    const csvRows = [];
    csvRows.push(headers.map(escapeCSV).join(","));

    for (const row of result.rows) {
      // Safe check and parsing of raw_tweet_json if it is a string
      let rawTweet: any = {};
      if (row.raw_tweet_json) {
        if (typeof row.raw_tweet_json === "string") {
          try {
            rawTweet = JSON.parse(row.raw_tweet_json);
          } catch {
            rawTweet = {};
          }
        } else {
          rawTweet = row.raw_tweet_json;
        }
      }

      // Extracted quote text and username
      const quote = rawTweet.quote || {};
      const quoted_text = quote.content || "";
      let quoted_username = quote.username || "";
      if (quoted_username && !quoted_username.startsWith("@")) {
        quoted_username = `@${quoted_username}`;
      }

      // 1. Cleaned quote text and main text
      const clean_quoted_text = cleanTextString(quoted_text);
      const clean_text = row.clean_text || cleanTextString(row.raw_text || "");

      // 2. Combined text using clean_text and clean_quoted_text (no URLs or noise)
      const combined_text = clean_quoted_text 
        ? `${clean_text} ${clean_quoted_text}` 
        : clean_text;

      // 3. Lightweight ML helper fields
      const has_quote = !!quoted_text;
      
      let has_media = false;
      let mediaStr = "";
      if (row.media) {
        if (Array.isArray(row.media)) {
          has_media = row.media.length > 0;
          mediaStr = JSON.stringify(row.media);
        } else if (typeof row.media === "string") {
          try {
            const parsedMedia = JSON.parse(row.media);
            has_media = Array.isArray(parsedMedia) && parsedMedia.length > 0;
            mediaStr = row.media;
          } catch {
            has_media = false;
            mediaStr = row.media;
          }
        } else {
          mediaStr = JSON.stringify(row.media);
        }
      }

      let urlsStr = "";
      if (row.urls) {
         if (typeof row.urls === "string") urlsStr = row.urls;
         else urlsStr = JSON.stringify(row.urls);
      }

      const has_url = !!(row.urls && Array.isArray(row.urls) && row.urls.length > 0) || /https?:\/\/[^\s]+/i.test(row.raw_text || "");
      
      const textForWordCount = row.raw_text || "";
      const word_count = textForWordCount.trim() ? textForWordCount.trim().split(/\s+/).length : 0;

      // 4. Convert metrics to strictly numeric types
      const likes_count = row.likes_count !== null && row.likes_count !== undefined ? Number(row.likes_count) : 0;
      const retweets_count = row.retweets_count !== null && row.retweets_count !== undefined ? Number(row.retweets_count) : 0;
      const replies_count = row.replies_count !== null && row.replies_count !== undefined ? Number(row.replies_count) : 0;
      const views_count = row.views_count !== null && row.views_count !== undefined ? Number(row.views_count) : "";

      // 5. User information at the top level
      const usernameVal = row.profile_username || cleanUsername;
      const fullnameVal = row.profile_fullname || "";
      const profileIdVal = row.profile_id !== null && row.profile_id !== undefined ? Number(row.profile_id) : "";

      const rowData = [
        row.id,
        row.id,
        usernameVal,
        fullnameVal,
        profileIdVal,
        row.created_at ? new Date(row.created_at).toISOString() : "",
        row.raw_text || "",
        clean_text,
        quoted_text,
        quoted_username,
        clean_quoted_text,
        combined_text,
        has_quote,
        has_media,
        has_url,
        word_count,
        likes_count,
        retweets_count,
        replies_count,
        views_count,
        mediaStr,
        urlsStr
      ];

      csvRows.push(rowData.map(escapeCSV).join(","));
    }

    const csvContent = csvRows.join("\n");

    // Return response as a file download
    const filename = `${cleanUsername}_tweets.csv`;
    
    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to download CSV:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download CSV" },
      { status: 500 }
    );
  }
}
