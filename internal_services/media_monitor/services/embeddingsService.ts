const ML_FASTAPI_URL = process.env.ML_FASTAPI_URL || "http://localhost:8000";

export async function generateEmbedding(cleanText: string): Promise<number[] | null> {
  try {
    const trimmed = cleanText.trim();
    if (!trimmed) return null;

    const res = await fetch(`${ML_FASTAPI_URL}/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ texts: [trimmed] }),
    });

    if (!res.ok) {
      throw new Error(`Failed to generate embedding: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.items && data.items.length > 0) {
      return data.items[0].embedding;
    }
    return null;
  } catch (error) {
    console.error("Error in generateEmbedding:", error);
    return null;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<{ text: string; embedding: number[] }[]> {
  const validTexts = texts.map(t => t.trim()).filter(Boolean);
  if (validTexts.length === 0) return [];

  try {
    const res = await fetch(`${ML_FASTAPI_URL}/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ texts: validTexts }),
    });

    if (!res.ok) {
      throw new Error(`Failed to generate batch embeddings: ${res.statusText}`);
    }

    const data = await res.json();
    return data.items || [];
  } catch (error) {
    console.error("Error in generateEmbeddings:", error);
    throw error;
  }
}

