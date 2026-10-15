import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username")?.replace("@", "").trim();

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    const result = await query<{
      raw_text: string;
      occurrence_count: string;
      tweet_ids: string[];
      first_seen: string;
      last_seen: string;
    }>(
      `
        SELECT
          t.raw_text,
          COUNT(*) AS occurrence_count,
          array_agg(t.id ORDER BY t.created_at ASC) AS tweet_ids,
          MIN(t.created_at) AS first_seen,
          MAX(t.created_at) AS last_seen
        FROM tweets t
        JOIN profiles p ON p.id = t.profile_id
        WHERE lower(p.username) = lower($1)
          AND t.raw_text IS NOT NULL
          AND t.raw_text != ''
        GROUP BY t.raw_text
        HAVING COUNT(*) > 1
        ORDER BY occurrence_count DESC
        LIMIT 200
      `,
      [username]
    );

    const totalDuplicateGroups = result.rows.length;
    const totalExtraCopies = result.rows.reduce(
      (sum, r) => sum + (Number(r.occurrence_count) - 1),
      0
    );

    return NextResponse.json({
      username,
      totalDuplicateGroups,
      totalExtraCopies,
      duplicates: result.rows.map((r) => ({
        raw_text: r.raw_text,
        count: Number(r.occurrence_count),
        tweet_ids: r.tweet_ids,
        first_seen: r.first_seen,
        last_seen: r.last_seen,
      })),
    });
  } catch (error) {
    console.error("check-duplicates error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
