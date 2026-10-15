import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = (searchParams.get("username") || "").replace("@", "");
    if (!username) return NextResponse.json({ current: 0, target: 0 });
    // Check the latest ingestion job status first to prevent infinite polling if job fails before profile is created
    const jobRes = await query<{ status: string; error: string; job_type: string; metadata: any }>(
      "SELECT status, error, job_type, metadata FROM processing_jobs WHERE job_type IN ('nitter_user_ingest', 'nitter_replies_ingest', 'nitter_gap_fill') AND metadata->>'username' = $1 ORDER BY started_at DESC LIMIT 1",
      [username]
    );

    let isComplete = false;
    let jobError: string | undefined = undefined;

    let jobType = "";
    let metadata: any = {};

    if (jobRes.rows.length > 0) {
      const job = jobRes.rows[0];
      jobType = job.job_type;
      metadata = job.metadata || {};
      if (job.status === 'completed' || job.status === 'failed') {
        isComplete = true;
      }
      if (job.status === 'failed' && job.error) {
        jobError = job.error;
      }
    }

    const profileRes = await query<{ id: number; tweet_count: string }>(
      "SELECT id, tweet_count FROM profiles WHERE lower(username) = lower($1) LIMIT 1",
      [username]
    );

    if (!profileRes.rows.length) {
      return NextResponse.json({ current: 0, target: 0, isComplete, error: jobError, jobType, metadata });
    }

    const { id, tweet_count } = profileRes.rows[0];

    const currentRes = await query<{ count: string }>(
      "SELECT count(*)::bigint FROM tweets WHERE profile_id = $1",
      [id]
    );

    return NextResponse.json({
      current: parseInt(currentRes.rows[0].count, 10),
      target: parseInt(tweet_count || "0", 10),
      isComplete,
      error: jobError,
      jobType,
      metadata
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to read progress" }, { status: 500 });
  }
}
