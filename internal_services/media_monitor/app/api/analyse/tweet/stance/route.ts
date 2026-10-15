import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let chunkInfo = "";
  try {
    const body = await request.json();
    const { topic_name, chunkIndex, totalChunks } = body;
    let tweets = body.tweets || [];
    let texts = body.texts || [];

    if (tweets.length > 0 && texts.length === 0) {
      texts = tweets.map((t: any) => t.text);
    }

    if (!texts || !Array.isArray(texts) || !topic_name) {
      return NextResponse.json({ error: "Invalid request payload. Expected 'tweets' or 'texts' array and 'topic_name' string." }, { status: 400 });
    }

    chunkInfo = chunkIndex !== undefined && totalChunks !== undefined
      ? `[Chunk ${chunkIndex}/${totalChunks}]`
      : "";

    // Strip empty/whitespace-only strings — the ML pipeline throws ValueError on them
    const filteredTexts = texts.filter((t: string) => typeof t === "string" && t.trim().length > 0);

    if (filteredTexts.length === 0) {
      console.info(`[Stance API] ${chunkInfo} No valid text to classify in this chunk.`);
      return NextResponse.json({ predictions: [] });
    }

    console.info(
      JSON.stringify({
        event: "stance_classification_batch_start",
        textsCount: filteredTexts.length,
        skippedEmpty: texts.length - filteredTexts.length,
        topic_name,
        chunkIndex,
        totalChunks,
        timestamp: new Date().toISOString(),
      })
    );
    console.info(`[Stance API] ${chunkInfo} Sending request to ML API for zero-shot stance classification of ${filteredTexts.length} texts...`);

    const startTime = Date.now();
    const mlResponse = await fetch("http://localhost:8000/predict/stance/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ texts: filteredTexts, topic_name }),
      signal: request.signal,
    });

    if (!mlResponse.ok) {
      const errorText = await mlResponse.text();
      throw new Error(`ML Service responded with ${mlResponse.status}: ${errorText}`);
    }

    const data = await mlResponse.json();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.info(
      JSON.stringify({
        event: "stance_classification_batch_success",
        textsCount: texts.length,
        durationSeconds: duration,
        timestamp: new Date().toISOString(),
      })
    );
    console.info(`[Stance API] ${chunkInfo} ✅ Stance classification successful in ${duration}s`);

    // Cache the predictions in PostgreSQL if IDs are provided
    if (tweets && tweets.length > 0 && data.predictions) {
      try {
        let filteredIndex = 0;
        const dbUpdates = [];
        for (let i = 0; i < tweets.length; i++) {
          const t = tweets[i];
          if (t && typeof t.text === "string" && t.text.trim().length > 0) {
            const pred = data.predictions[filteredIndex];
            if (pred && t.id) {
              dbUpdates.push(
                query(
                  `UPDATE thread_tweets SET stance_label = $1, stance_score = $2 WHERE id = $3`,
                  [pred.label, pred.score, t.id]
                )
              );
            }
            filteredIndex++;
          }
        }
        if (dbUpdates.length > 0) {
          await Promise.all(dbUpdates);
          console.info(`[Stance API] Cached ${dbUpdates.length} reply stance predictions in DB.`);
        }
      } catch (dbErr) {
        console.warn("[Stance API] Failed to update stance cache in DB:", dbErr);
      }
    }

    return NextResponse.json(data);
  } catch (error: any) {
    const isAbort = error.name === "AbortError" || request.signal.aborted;

    if (isAbort) {
      console.warn(`[Stance API] ${chunkInfo} 🛑 Request aborted by the client.`);
    }

    console.error(
      JSON.stringify({
        event: isAbort ? "stance_classification_batch_aborted" : "stance_classification_batch_error",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json(
      { error: isAbort ? "Request was aborted by client" : (error instanceof Error ? error.message : "Failed to classify stance") },
      { status: isAbort ? 499 : 500 }
    );
  }
}
