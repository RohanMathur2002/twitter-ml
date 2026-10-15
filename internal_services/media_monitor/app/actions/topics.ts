"use server";

import * as repository from "@/services/TopicRepository";
import { updateTopicEmbeddings } from "@/services/topicEmbeddingService";
import { revalidatePath } from "next/cache";

export async function fetchTopics() {
  try {
    return await repository.get_all_topics();
  } catch (error) {
    console.error("Error fetching topics:", error);
    throw new Error("Failed to fetch topics");
  }
}

export async function saveTopic(data: {
  id?: string;
  name: string;
  semantic_queries: string[];
  negative_semantics: string[];
  positive_sarcasm_cues: string[];
  negative_sarcasm_cues: string[];
  similarity_threshold: number;
  is_active: boolean;
}) {
  try {
    let result;
    if (data.id) {
      result = await repository.update_topic(data.id, data);
    } else {
      // Check for duplicate name (case insensitive)
      const existing = await repository.get_topic_by_name(data.name);
      if (existing) {
        throw new Error(`A topic named "${data.name}" already exists.`);
      }
      result = await repository.create_topic(data);
    }

    if (result && result.id) {
      try {
        await updateTopicEmbeddings(result.id);
      } catch (embErr) {
        console.error("Failed to generate and store topic embeddings on save:", embErr);
        // Note: We don't fail the entire save action if only embedding generation fails, 
        // but we log it clearly so developers can debug connections.
      }
    }

    revalidatePath("/topics");
    return result;
  } catch (error: any) {
    console.error("Error saving topic:", error);
    throw new Error(error.message || "Failed to save topic");
  }
}


export async function removeTopic(id: string) {
  try {
    const success = await repository.delete_topic(id);
    revalidatePath("/topics");
    return success;
  } catch (error) {
    console.error("Error deleting topic:", error);
    throw new Error("Failed to delete topic");
  }
}

export async function fetchProfiles() {
  try {
    const { getAllProfiles } = await import("@/services/profileService");
    return await getAllProfiles();
  } catch (error) {
    console.error("Error fetching profiles:", error);
    throw new Error("Failed to fetch profiles");
  }
}

export async function analyzeProfileForTopic(username: string, topicId: string) {
  try {
    const { getProfileByUsername } = await import("@/services/profileService");
    const { analyzeProfileForTopic: runTopicAnalysis } = await import(
      "@/services/topicIntelligenceService"
    );

    const profile = await getProfileByUsername(username);
    if (!profile) {
      throw new Error(`Profile "${username}" not found.`);
    }

    const result = await runTopicAnalysis(profile.id, topicId);
    if (!result) return null;

    return {
      ...result,
      profile: profile.username,
    };
  } catch (error: any) {
    console.error("Error in analyzeProfileForTopic server action:", error);
    throw new Error(error.message || "Failed to analyze profile for topic");
  }
}

export async function getProfileTopicIntelligence(username: string, topicId: string) {
  try {
    const { getProfileByUsername, searchProfileByNameOrUsername } = await import("@/services/profileService");
    const { getCachedProfileTopicIntelligence } = await import(
      "@/services/topicIntelligenceService"
    );

    let profile: import("@/services/profileService").DbProfile | null = await getProfileByUsername(username);
    if (!profile) {
      profile = await searchProfileByNameOrUsername(username);
    }
    if (!profile) return null;

    const result = await getCachedProfileTopicIntelligence(profile.id, topicId);
    if (!result) return null;

    return {
      ...result,
      profile: profile.username,
    };
  } catch (error) {
    console.error("Error in getProfileTopicIntelligence server action:", error);
    return null;
  }
}


