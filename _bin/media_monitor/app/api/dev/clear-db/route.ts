import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Desired truncation order (children before parents to respect FK constraints)
const DESIRED_TABLE_ORDER = [
  "cluster_tweets",
  "profile_relationships",
  "profile_analysis",
  "hashtag_stats",
  "clusters",
  "tweets",
  "processing_jobs",
  "profiles",
];

export async function POST() {
  try {
    console.info(JSON.stringify({ event: "dev_clear_db_start", timestamp: new Date().toISOString() }));

    // Check which tables actually exist in the current schema
    const existingResult = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND table_name = ANY($1)`,
      [DESIRED_TABLE_ORDER]
    );

    const existingSet = new Set(existingResult.rows.map((r) => r.table_name));
    const tablesToClear = DESIRED_TABLE_ORDER.filter((t) => existingSet.has(t));
    const skipped = DESIRED_TABLE_ORDER.filter((t) => !existingSet.has(t));

    console.info(JSON.stringify({
      event: "dev_clear_db_plan",
      willClear: tablesToClear,
      skipped,
      timestamp: new Date().toISOString(),
    }));

    const cleared: string[] = [];

    for (const table of tablesToClear) {
      console.info(JSON.stringify({ event: "dev_clear_db_truncating", table, timestamp: new Date().toISOString() }));
      await query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
      cleared.push(table);
    }

    console.info(JSON.stringify({ event: "dev_clear_db_success", cleared, skipped, timestamp: new Date().toISOString() }));

    return NextResponse.json({ success: true, cleared, skipped });
  } catch (error) {
    console.error(JSON.stringify({
      event: "dev_clear_db_error",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to clear database" },
      { status: 500 }
    );
  }
}
