"use server";

import * as mapService from "@/services/mapService";
import { revalidatePath } from "next/cache";

const FASTAPI_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchGlobalMapCoordinates() {
  try {
    return await mapService.getGlobalMapCoordinates();
  } catch (error) {
    console.error("Error fetching global map coordinates:", error);
    throw new Error("Failed to fetch global map coordinates");
  }
}

export async function fetchTopicMapCoordinates(topicId: string) {
  try {
    return await mapService.getTopicMapCoordinates(topicId);
  } catch (error) {
    console.error(`Error fetching topic map coordinates for ${topicId}:`, error);
    throw new Error("Failed to fetch topic map coordinates");
  }
}

export async function generateGlobalMap() {
  try {
    const res = await fetch(`${FASTAPI_URL}/maps/global/generate`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error("Failed to trigger global map generation");
    }
    // Wait a bit or return success (it's async)
    revalidatePath("/intelligence/map");
    return { success: true };
  } catch (error) {
    console.error("Error triggering global map generation:", error);
    throw new Error("Failed to trigger global map generation");
  }
}

export async function generateTopicMap(topicId: string) {
  try {
    const res = await fetch(`${FASTAPI_URL}/maps/topic/${topicId}/generate`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(`Failed to trigger topic map generation for ${topicId}`);
    }
    revalidatePath(`/topics/${topicId}`);
    return { success: true };
  } catch (error) {
    console.error(`Error triggering topic map generation for ${topicId}:`, error);
    throw new Error("Failed to trigger topic map generation");
  }
}
