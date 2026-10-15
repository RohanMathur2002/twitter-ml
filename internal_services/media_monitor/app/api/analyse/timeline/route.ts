import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = (searchParams.get("username") || "").replace("@", "").trim();
    const range = searchParams.get("range") || "90d";
    const granularityParam = searchParams.get("granularity");

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const profileResult = await query<{ id: number }>(
      "SELECT id FROM profiles WHERE lower(username) = lower($1) LIMIT 1",
      [username]
    );

    const profileId = profileResult.rows[0]?.id;
    if (!profileId) {
      return NextResponse.json({ timeline: [] }, { status: 200 });
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

    const sqlParams: any[] = [profileId];
    const whereClauses: string[] = ["t.profile_id = $1"];

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
        TO_CHAR(DATE_TRUNC('${truncUnit}', t.created_at), 'YYYY-MM-DD') AS period,
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

    const timelineData = res.rows.map((row) => ({
      period: row.period, // YYYY-MM-DD string from TO_CHAR
      posts: Number(row.posts || 0),
      original_posts: Number(row.original_posts || 0),
      reply_posts: Number(row.reply_posts || 0),
      retweet_posts: Number(row.retweet_posts || 0),
      likes: Number(row.likes || 0),
      comments: Number(row.comments || 0),
      reposts: Number(row.reposts || 0),
      views: Number(row.views || 0),
    }));

    let startBoundary = sinceDate ? new Date(sinceDate) : null;
    let endBoundary = untilDate ? new Date(untilDate) : new Date();

    if (!startBoundary && timelineData.length > 0) {
      startBoundary = new Date(timelineData[0].period);
    }

    let filledTimeline = timelineData;

    if (startBoundary && endBoundary) {
      const current = new Date(startBoundary);
      
      const truncateDate = (dateObj: Date) => {
        if (truncUnit === 'day') {
          dateObj.setUTCHours(0, 0, 0, 0);
        } else if (truncUnit === 'month') {
          dateObj.setUTCDate(1);
          dateObj.setUTCHours(0, 0, 0, 0);
        } else if (truncUnit === 'week') {
          const day = dateObj.getUTCDay();
          const diff = dateObj.getUTCDate() - day + (day === 0 ? -6 : 1);
          dateObj.setUTCDate(diff);
          dateObj.setUTCHours(0, 0, 0, 0);
        }
      };

      truncateDate(current);

      const truncatedEnd = new Date(endBoundary);
      truncateDate(truncatedEnd);

      filledTimeline = [];
      const dataMap = new Map();
      timelineData.forEach(t => dataMap.set(t.period, t));

      let lastDbPeriod = current;
      if (timelineData.length > 0) {
        lastDbPeriod = new Date(timelineData[timelineData.length - 1].period);
      }
      
      const finalEnd = truncatedEnd > lastDbPeriod ? truncatedEnd : lastDbPeriod;
      
      const toDateStr = (d: Date) => d.toISOString().split('T')[0];

      while (current <= finalEnd) {
        const periodKey = toDateStr(current);
        const isoPeriod = current.toISOString();
        
        if (dataMap.has(periodKey)) {
          filledTimeline.push({ ...dataMap.get(periodKey), period: isoPeriod });
        } else {
          filledTimeline.push({
            period: isoPeriod,
            posts: 0,
            original_posts: 0,
            reply_posts: 0,
            retweet_posts: 0,
            likes: 0,
            comments: 0,
            reposts: 0,
            views: 0,
          });
        }

        if (truncUnit === 'day') {
          current.setUTCDate(current.getUTCDate() + 1);
        } else if (truncUnit === 'week') {
          current.setUTCDate(current.getUTCDate() + 7);
        } else if (truncUnit === 'month') {
          current.setUTCMonth(current.getUTCMonth() + 1);
        }
      }
    }

    return NextResponse.json({ timeline: filledTimeline, truncUnit });
  } catch (err) {
    console.error("Error in timeline route:", err);
    return NextResponse.json({ error: "Failed to fetch timeline data" }, { status: 500 });
  }
}
