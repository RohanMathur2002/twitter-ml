import { NextRequest } from "next/server";

// We want this route to be dynamically rendered to handle streaming
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const username = searchParams.get('username');
  const topicId = searchParams.get('topicId');
  
  if (!username || !topicId) {
    return new Response("Missing parameters", { status: 400 });
  }

  // Find profile ID from username
  const { getProfileByUsername } = await import("@/services/profileService");
  const profile = await getProfileByUsername(username);
  if (!profile) {
    return new Response("Profile not found", { status: 404 });
  }

  const mlUrl = process.env.ML_FASTAPI_URL || "http://127.0.0.1:8000";
  const targetUrl = `${mlUrl}/intelligence/profile-topic/${profile.id}/${topicId}/stream`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
      },
      // Important to prevent timeouts on the proxy fetch
      signal: AbortSignal.timeout(600000), // 10 minutes
    });

    if (!response.ok) {
      return new Response(`Failed to fetch stream: ${response.status}`, { status: response.status });
    }

    // Return the stream
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error("Error proxying SSE:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
