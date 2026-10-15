import "server-only";

import { DEFAULT_GEMINI_MODEL, type GeminiModel } from "@/lib/ai/geminiModels";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export class GeminiApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
  }
}

export async function callGemini(
  prompt: string,
  model: GeminiModel = DEFAULT_GEMINI_MODEL
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new GeminiApiError("GEMINI_API_KEY is not configured on the server.", 500);
  }

  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    throw new GeminiApiError("Prompt must not be empty.", 400);
  }

  const endpoints = [
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  ];

  let lastError: GeminiApiError | null = null;

  for (const endpoint of endpoints) {
    let response: Response;
    try {
      response = await fetch(`${endpoint}?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: trimmedPrompt }],
            },
          ],
        }),
        cache: "no-store",
      });
    } catch {
      throw new GeminiApiError("Failed to reach the Gemini API.", 502);
    }

    const data = (await response
      .json()
      .catch(() => null)) as GeminiGenerateContentResponse | null;

    if (response.ok) {
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();

      if (!text) {
        throw new GeminiApiError("Gemini API returned no text content.", 502);
      }

      return text;
    }

    const message = data?.error?.message?.trim();
    const err = new GeminiApiError(
      message || `Gemini API request failed with status ${response.status}.`,
      response.status
    );
    lastError = err;

    const isV1 = endpoint.includes("/v1/");
    const retryOnV1Mismatch =
      isV1 &&
      (message?.toLowerCase().includes("not found for api version") ||
        message?.toLowerCase().includes("not supported for generatecontent"));

    if (!retryOnV1Mismatch) {
      throw err;
    }
  }

  // Should never reach here unless every endpoint fails with retry-able errors.
  throw lastError ?? new GeminiApiError("Gemini API request failed.", 500);
}
