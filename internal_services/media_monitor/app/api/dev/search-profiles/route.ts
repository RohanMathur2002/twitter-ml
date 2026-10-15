import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";

    if (!q || q.trim().length === 0) {
      return NextResponse.json({ profiles: [] });
    }

    const searchQuery = `%${q.trim()}%`;
    const result = await query(
      `SELECT username, display_name, profile_image_url
       FROM profiles
       WHERE username ILIKE $1 OR display_name ILIKE $1
       ORDER BY followers_count DESC
       LIMIT 10`,
      [searchQuery]
    );

    return NextResponse.json({ profiles: result.rows });
  } catch (error) {
    console.error("Error searching profiles:", error);
    return NextResponse.json(
      { error: "Failed to search profiles" },
      { status: 500 }
    );
  }
}
