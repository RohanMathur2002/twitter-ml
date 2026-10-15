import { query, transaction } from "@/lib/db";
import { generateEmbeddings } from "./embeddingsService";

export interface TopicEmbedding {
  id?: string;
  topic_id: string;
  field_name: "topic_name" | "semantic_queries" | "negative_semantics" | "positive_sarcasm_cues" | "negative_sarcasm_cues";
  text: string;
  embedding: number[];
  weight_priority: number;
}

/**
 * Updates embeddings for a specific topic in the database with sequence priority logic.
 * This should be triggered whenever a topic is saved, edited, or created.
 */
export async function updateTopicEmbeddings(topicId: string): Promise<void> {
  console.log(`[EmbeddingService] Initializing priority-weighted topic embedding update for: ${topicId}`);
  
  // 1. Fetch the topic details
  const topicRes = await query<any>(
    "SELECT id, name, semantic_queries, negative_semantics, positive_sarcasm_cues, negative_sarcasm_cues FROM topics WHERE id = $1 LIMIT 1",
    [topicId]
  );
  
  if (topicRes.rowCount === 0) {
    console.warn(`[EmbeddingService] Topic not found: ${topicId}`);
    return;
  }
  
  const topic = topicRes.rows[0];
  
  // 2. Compile list of all items that need to be embedded in strict sequence
  const itemsToEmbed: {
    field_name: TopicEmbedding["field_name"];
    text: string;
    weight_priority: number;
  }[] = [];

  // A. Topic Name itself (Highest Priority: 0)
  const topicNameClean = String(topic.name).trim();
  if (topicNameClean) {
    itemsToEmbed.push({
      field_name: "topic_name",
      text: topicNameClean,
      weight_priority: 0,
    });
  }

  // B. Other array fields (Sequence Priorities: index + 1)
  const fields = [
    { name: "semantic_queries", texts: topic.semantic_queries || [] },
    { name: "negative_semantics", texts: topic.negative_semantics || [] },
    { name: "positive_sarcasm_cues", texts: topic.positive_sarcasm_cues || [] },
    { name: "negative_sarcasm_cues", texts: topic.negative_sarcasm_cues || [] },
  ] as const;

  for (const field of fields) {
    const rawTexts = Array.isArray(field.texts) ? field.texts : [];
    rawTexts.forEach((txt: any, index: number) => {
      const trimmed = String(txt).trim();
      if (trimmed) {
        itemsToEmbed.push({
          field_name: field.name,
          text: trimmed,
          weight_priority: index + 1, // 1-based exact sequence index
        });
      }
    });
  }

  if (itemsToEmbed.length === 0) {
    console.log(`[EmbeddingService] No texts to embed for topic '${topic.name}'`);
    return;
  }

  // 3. Batch generate embeddings for all compiled texts in one call
  console.log(`[EmbeddingService] Generating batch embeddings for ${itemsToEmbed.length} items (topic name + keywords)`);
  
  const textsToGenerate = itemsToEmbed.map(item => item.text);
  let embeddingResults: { text: string; embedding: number[] }[] = [];
  
  try {
    embeddingResults = await generateEmbeddings(textsToGenerate);
  } catch (err) {
    console.error(`[EmbeddingService] Failed batch generation for topic '${topic.name}':`, err);
    throw err;
  }

  // 4. Store items into the database under transaction, matching indices exactly
  console.log(`[EmbeddingService] Saving ${itemsToEmbed.length} priority-weighted embeddings to PostgreSQL...`);
  await transaction(async (client) => {
    // Delete existing embeddings for this topic
    await client.query("DELETE FROM topic_embeddings WHERE topic_id = $1", [topicId]);

    // Insert new embeddings in original order
    for (let i = 0; i < itemsToEmbed.length; i++) {
      const item = itemsToEmbed[i];
      const match = embeddingResults[i];

      if (!match || !match.embedding) {
        console.warn(`[EmbeddingService] Missing embedding at index ${i} for text: "${item.text}"`);
        continue;
      }

      const vectorString = `[${match.embedding.join(",")}]`;
      await client.query(
        `
        INSERT INTO topic_embeddings (topic_id, field_name, text, embedding, weight_priority)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [topicId, item.field_name, item.text, vectorString, item.weight_priority]
      );
    }
  });

  console.log(`[EmbeddingService] Priority-weighted embeddings successfully stored for topic '${topic.name}'!`);
}
