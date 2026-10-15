import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get("keyword")?.trim();
    const range = searchParams.get("range") || "90d";
    const granularityParam = searchParams.get("granularity");

    if (!keyword) {
      return NextResponse.json({ error: "Keyword is required" }, { status: 400 });
    }

    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    let sinceDate: Date | null = null;
    let untilDate: Date | null = null;
    const now = new Date();

    if (startDateParam && startDateParam.trim() !== "") {
      const parsedStart = new Date(startDateParam);
      if (!isNaN(parsedStart.getTime())) sinceDate = parsedStart;
    } else if (range === "30d") {
      sinceDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    } else if (range === "90d") {
      sinceDate = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
    } else if (range === "1y") {
      sinceDate = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
    }

    if (endDateParam && endDateParam.trim() !== "") {
      const parsedEnd = new Date(endDateParam);
      if (!isNaN(parsedEnd.getTime())) {
        // Set to 23:59:59.999 UTC of the selected end date
        parsedEnd.setUTCHours(23, 59, 59, 999);
        untilDate = parsedEnd;
      }
    }

    let truncUnit = "day";
    if (granularityParam === "day" || granularityParam === "week" || granularityParam === "month") {
      truncUnit = granularityParam;
    } else {
      if (range === "1y") truncUnit = "week";
      else if (range === "all") truncUnit = "month";
      else truncUnit = "day";
    }

    const sqlParams: any[] = [`%${keyword}%`];
    const whereClauses: string[] = ["t.raw_text ILIKE $1"];

    if (sinceDate) {
      sqlParams.push(sinceDate.toISOString());
      whereClauses.push(`t.created_at >= $${sqlParams.length}`);
    }
    if (untilDate) {
      sqlParams.push(untilDate.toISOString());
      whereClauses.push(`t.created_at <= $${sqlParams.length}`);
    }

    const sql = `
      SELECT
        DATE_TRUNC('${truncUnit}', t.created_at) AS period,
        COUNT(*)::int AS posts,
        COUNT(*) FILTER (WHERE NOT t.is_reply AND NOT t.is_retweet)::int AS original_posts,
        COUNT(*) FILTER (WHERE t.is_reply)::int AS reply_posts,
        COUNT(*) FILTER (WHERE t.is_retweet)::int AS retweet_posts,
        COALESCE(SUM(t.likes_count), 0)::bigint AS likes,
        COALESCE(SUM(t.replies_count), 0)::bigint AS comments,
        COALESCE(SUM(t.retweets_count), 0)::bigint AS reposts,
        COALESCE(SUM(t.views_count), 0)::bigint AS views
      FROM tweets t
      WHERE ${whereClauses.join(" AND ")}
      GROUP BY period
      ORDER BY period ASC
    `;

    const res = await query<{
      period: string;
      posts: number;
      original_posts: number;
      reply_posts: number;
      retweet_posts: number;
      likes: number;
      comments: number;
      reposts: number;
      views: number;
    }>(sql, sqlParams);

    return NextResponse.json({ timeline: res.rows }, { status: 200 });
  } catch (error) {
    console.error("Keyword Timeline error:", error);
    return NextResponse.json({ error: "Failed to fetch keyword timeline" }, { status: 500 });
  }
}
