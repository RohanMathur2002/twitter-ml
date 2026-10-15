import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    const cleanUsername = username.replace("@", "").trim().toLowerCase();

    const result = await query(
      `DELETE FROM profiles WHERE lower(username) = $1 RETURNING id`,
      [cleanUsername]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, deleted_id: result.rows[0].id });
  } catch (error) {
    console.error("Error deleting profile:", error);
    return NextResponse.json(
      { error: "Failed to delete profile" },
      { status: 500 }
    );
  }
}
