import { NextResponse } from "next/server";
import { getProfileByUsername } from "@/services/profileService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username") || "";
    
    console.info(JSON.stringify({ event: "profile_fetch_start", username, timestamp: new Date().toISOString() }));

    const profile = await getProfileByUsername(username);

    if (!profile) {
      console.warn(JSON.stringify({ event: "profile_fetch_not_found", username, timestamp: new Date().toISOString() }));
      return NextResponse.json({ profile: null }, { status: 404 });
    }

    console.info(JSON.stringify({ event: "profile_fetch_success", username, timestamp: new Date().toISOString() }));
    return NextResponse.json({ profile });
  } catch (error) {
    console.error(JSON.stringify({ 
      event: "profile_fetch_error", 
      error: error instanceof Error ? error.message : String(error), 
      timestamp: new Date().toISOString() 
    }));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read profile" },
      { status: 500 }
    );
  }
}
