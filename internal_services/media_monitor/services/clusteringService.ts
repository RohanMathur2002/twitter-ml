export async function queueClusteringForProfile(profileId: number) {
  try {
    const mlApiUrl = process.env.ML_FASTAPI_URL || "http://localhost:8000";
    
    // We trigger clustering in the background. HDBSCAN might take a few seconds.
    // The ML backend will fetch embeddings and save to tweet_clusters.
    fetch(`${mlApiUrl}/intelligence/cluster-profile/${profileId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }).catch(err => {
      console.error(`[ClusteringService] Background clustering failed for profile ${profileId}:`, err);
    });

    return { queued: true };
  } catch (err) {
    console.error(`[ClusteringService] Error queueing clustering for profile ${profileId}:`, err);
    return { queued: false, error: String(err) };
  }
}
