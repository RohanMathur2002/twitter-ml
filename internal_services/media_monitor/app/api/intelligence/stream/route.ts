import { NextRequest } from "next/server";
import http from "http";

export const dynamic = 'force-dynamic';
export const maxDuration = 3600;

function streamError(message: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const data = JSON.stringify({ status: "error", message });
      controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const username = searchParams.get('username');
  const topicId = searchParams.get('topicId');
  const modelName = searchParams.get('modelName');
  
  if (!username || !topicId) {
    return streamError("Missing required parameters: username and topicId are required.");
  }

  try {
    const { getProfileByUsername, searchProfileByNameOrUsername } = await import("@/services/profileService");
    let profile: import("@/services/profileService").DbProfile | null = await getProfileByUsername(username);
    if (!profile) {
      profile = await searchProfileByNameOrUsername(username);
    }
    if (!profile) {
      return streamError(`Profile "${username}" not found in database. Please ingest it first.`);
    }

    const mlUrl = process.env.ML_FASTAPI_URL || "http://127.0.0.1:8000";
    const modelParam = modelName ? `?model_name=${encodeURIComponent(modelName)}` : '';
    const targetUrl = `${mlUrl}/intelligence/profile-topic/${profile.id}/${topicId}/stream${modelParam}`;

    return new Promise<Response>((resolve) => {
      const parsedUrl = new URL(targetUrl);
      const reqOpts: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 8000,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: {
          "Accept": "text/event-stream",
        },
      };

      const clientReq = http.request(reqOpts, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          resolve(streamError(`ML backend returned error ${res.statusCode}.`));
          return;
        }

        const stream = new ReadableStream({
          start(controller) {
            res.on("data", (chunk) => {
              controller.enqueue(chunk);
            });
            res.on("end", () => {
              try { controller.close(); } catch {}
            });
            res.on("error", (err) => {
              try { controller.error(err); } catch {}
            });
          },
          cancel() {
            res.destroy();
            clientReq.destroy();
          }
        });

        // Abort HTTP request if client disconnects
        req.signal.addEventListener("abort", () => {
          res.destroy();
          clientReq.destroy();
        });

        resolve(
          new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive",
            },
          })
        );
      });

      clientReq.on("error", (err) => {
        console.error("HTTP SSE proxy error:", err);
        resolve(streamError("Connection error during analysis. Ensure ML backend is running."));
      });

      // Handle client signal cancellation
      req.signal.addEventListener("abort", () => {
        clientReq.destroy();
      });

      clientReq.end();
    });
  } catch (error: any) {
    console.error("Error proxying SSE:", error);
    return streamError("Connection error during analysis. Ensure ML backend is running.");
  }
}

