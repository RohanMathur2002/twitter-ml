import { NextResponse } from "next/server";
import { searchKeywords } from "@/services/keywordService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || searchParams.get("keyword") || "";
    const page = Number(searchParams.get("page") || 1);
    const limit = Number(searchParams.get("limit") || 25);
    const mode = (searchParams.get("mode") || "live") as "live" | "db";

    if (!q.trim()) {
      return NextResponse.json(
        { error: "Keyword parameter 'q' is required" },
        { status: 400 }
      );
    }

    console.info(
      JSON.stringify({
        event: "keyword_search_start",
        keyword: q,
        mode,
        page,
        limit,
        timestamp: new Date().toISOString(),
      })
    );

    const result = await searchKeywords(q, page, limit, mode);

    console.info(
      JSON.stringify({
        event: "keyword_search_success",
        keyword: q,
        page,
        count: result.tweets.length,
        total: result.total,
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "keyword_search_error",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      })
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search keyword" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || searchParams.get("keyword") || "";

    if (!q.trim()) {
      return NextResponse.json(
        { error: "Keyword parameter 'q' is required" },
        { status: 400 }
      );
    }

    const { deleteKeywordData } = await import("@/services/keywordService");
    const count = await deleteKeywordData(q);

    return NextResponse.json({ success: true, deleted: count });
  } catch (error) {
    console.error("[keyword_delete_error]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete keyword data" },
      { status: 500 }
    );
  }
}
