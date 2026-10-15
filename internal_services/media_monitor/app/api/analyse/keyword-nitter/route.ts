import { NextResponse } from "next/server";
import {
  startKeywordNitterIngestion,
  stopKeywordNitterIngestion,
  getKeywordNitterJobStatus,
} from "@/pipeline/ingestKeywordTweets";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId parameter is required" }, { status: 400 });
    }

    const status = getKeywordNitterJobStatus(jobId);
    if (!status) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch status" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action || "start";

    if (action === "stop") {
      const jobId = String(body.jobId || "");
      if (!jobId) {
        return NextResponse.json({ error: "jobId is required to stop search" }, { status: 400 });
      }
      const stopped = stopKeywordNitterIngestion(jobId);
      return NextResponse.json({ stopped, jobId });
    }

    const keyword = String(body.keyword || "").trim();
    if (!keyword) {
      return NextResponse.json({ error: "keyword parameter is required" }, { status: 400 });
    }

    const daysLimit = body.daysLimit !== undefined && body.daysLimit !== "all" ? Number(body.daysLimit) : undefined;
    const maxResults = body.maxResults ? Number(body.maxResults) : 250;
    const sinceDate = body.sinceDate ? String(body.sinceDate).trim() : undefined;
    const untilDate = body.untilDate ? String(body.untilDate).trim() : undefined;
    const saveToDb = body.saveToDb !== undefined ? Boolean(body.saveToDb) : true;

    const jobId = `kw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    startKeywordNitterIngestion(jobId, keyword, {
      daysLimit: Number.isFinite(daysLimit) ? daysLimit : undefined,
      maxResults,
      sinceDate,
      untilDate,
      saveToDb,
    }).catch((err) => {
      console.error(`[KeywordNitterAPI] Uncaught error in ingestion job ${jobId}:`, err);
    });

    return NextResponse.json({
      jobId,
      keyword,
      status: "running",
      message: `Started live Nitter search for "${keyword}"`,
    }, { status: 202 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start Nitter search" },
      { status: 500 }
    );
  }
}
