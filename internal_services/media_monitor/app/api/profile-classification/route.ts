import { NextResponse } from "next/server";
import { GeminiApiError, callGemini } from "@/lib/ai/gemini";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_OPTIONS,
  type GeminiModel,
} from "@/lib/ai/geminiModels";
import { buildProfileClassificationPrompt } from "@/lib/ai/profileClassification";

type ClassificationRequestBody = {
  username?: string;
  tweets?: any[];
  geminiModel?: string;
  bio?: string;
};

const GEMINI_MODELS = new Set<string>(GEMINI_MODEL_OPTIONS.map((option) => option.value));

function extractLeftRightScore(classification: string): number | null {
  const scoreMatch = classification.match(/Left-Right Score:\s*([0-9]{1,3})/i);
  if (!scoreMatch) return null;

  const parsed = Number.parseInt(scoreMatch[1], 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ClassificationRequestBody;
    const username = body.username?.trim();
    const tweets = body.tweets || [];
    const bio = body.bio || "";
    const geminiModel = GEMINI_MODELS.has(body.geminiModel ?? "")
      ? (body.geminiModel as GeminiModel)
      : DEFAULT_GEMINI_MODEL;

    if (!username) {
      return NextResponse.json(
        { error: "Username is required to classify a profile." },
        { status: 400 }
      );
    }

    const prompt = buildProfileClassificationPrompt(username, tweets, bio);
    const classification = await callGemini(prompt, geminiModel);
    const leftRightScore = extractLeftRightScore(classification);

    return NextResponse.json({ classification, leftRightScore, geminiModel });
  } catch (error) {
    if (error instanceof GeminiApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error ? error.message : "Unknown error generating classification.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
