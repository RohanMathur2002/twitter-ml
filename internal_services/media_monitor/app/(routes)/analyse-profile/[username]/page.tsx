"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { CheckCircle, Loader2, AlertTriangle, RefreshCw, X } from "lucide-react";
import { fetchTopics, getProfileTopicIntelligence } from "@/app/actions/topics";
import { EngagementTimelineChart } from "@/components/analyse/EngagementTimelineChart";
import type { Topic } from "@/services/TopicRepository";
import type { TopicIntelligenceResult } from "@/services/topicIntelligenceService";

interface DbProfile {
  username: string;
  display_name: string | null;
  bio: string | null;
  followers_count: string;
  following_count: string;
  tweet_count: string;
  profile_image_url: string | null;
  location: string | null;
  scraped_at: string;
}

interface AnalyseStats {
  total_tweets: string;
  total_hashtags: string;
  avg_likes: string | null;
  avg_retweets: string | null;
  avg_replies: string | null;
  retweet_ratio: string | null;
  avg_tweets_per_day_30d: string | null;
  avg_tweets_per_day_1y: string | null;
  avg_tweets_per_day_full: string | null;
  engagement_rate: string | null;
  reply_ratio: string | null;
  mostUsedHashtags: Array<{ hashtag: string; usage_count: string }>;
  languageDistribution: Array<{ lang: string; count: string }>;
  mostActivePostingHours: Array<{ hour: string; count: string }>;
  mostActivePostingDays: Array<{ dow: number; count: string }>;
}

function formatNumber(value: string | number | null | undefined) {
  if (value === undefined || value === null) return "-";
  return Number(value || 0).toLocaleString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AnalyseProfilePage() {
  return (
    <Suspense fallback={<div className="p-10 text-[var(--text-muted)]">Loading profile analysis...</div>}>
      <ProfileDashboard />
    </Suspense>
  );
}

function ProfileDashboard() {
  const params = useParams();
  const username = (params?.username as string) || "neutralobserver";
  const cleanUsername = username.replace("@", "").trim();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [stats, setStats] = useState<AnalyseStats | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [intelligenceMap, setIntelligenceMap] = useState<Record<string, TopicIntelligenceResult>>({});

  // SSE tracking states
  const [submittingProfile, setSubmittingProfile] = useState<Record<string, boolean>>({});
  const [analysisProgress, setAnalysisProgress] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!cleanUsername) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // 1. Fetch profile metadata
        const profileRes = await fetch(`/api/analyse/profile?username=${encodeURIComponent(cleanUsername)}`);
        if (profileRes.ok) {
          const profileJson = await profileRes.json();
          setProfile(profileJson.profile);
        }

        // 2. Fetch stats
        const statsRes = await fetch(`/api/analyse/stats?username=${encodeURIComponent(cleanUsername)}`);
        if (statsRes.ok) {
          const statsJson = await statsRes.json();
          setStats(statsJson.stats);
        }

        // 3. Fetch active topics
        const topicsData = await fetchTopics();
        setTopics(topicsData || []);

        // 4. Fetch cached topic intelligence
        if (topicsData && topicsData.length > 0) {
          const intelPromises = topicsData.map(async (topic) => {
            try {
              const res = await getProfileTopicIntelligence(cleanUsername, topic.id);
              if (res) {
                setIntelligenceMap(prev => ({
                  ...prev,
                  [topic.id]: res
                }));
              }
            } catch (e) {
              console.error(e);
            }
          });
          await Promise.all(intelPromises);
        }
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [cleanUsername]);

  const activeEventSourcesRef = useRef<Record<string, { es: EventSource; stop: () => void }>>({});

  const stopStreamAnalysis = (topicId: string) => {
    const entry = activeEventSourcesRef.current[topicId];
    if (entry) {
      entry.stop();
    }
    setSubmittingProfile(prev => ({ ...prev, [topicId]: false }));
    setAnalysisProgress(prev => { const next = { ...prev }; delete next[topicId]; return next; });
  };

  const runStreamAnalysis = (topicId: string): Promise<TopicIntelligenceResult> => {
    return new Promise((resolve, reject) => {
      if (activeEventSourcesRef.current[topicId]) {
        activeEventSourcesRef.current[topicId].stop();
      }
      const eventSource = new EventSource(`/api/intelligence/stream?username=${encodeURIComponent(cleanUsername)}&topicId=${encodeURIComponent(topicId)}`);

      const cleanup = () => {
        eventSource.close();
        delete activeEventSourcesRef.current[topicId];
      };

      activeEventSourcesRef.current[topicId] = {
        es: eventSource,
        stop: () => {
          cleanup();
          reject(new Error("Analysis stopped by user."));
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.status === "fetching_metadata") {
            setAnalysisProgress(prev => ({ ...prev, [topicId]: "Fetching topic metadata..." }));
          } else if (data.status === "fetching_tweets") {
            setAnalysisProgress(prev => ({ ...prev, [topicId]: "Fetching profile tweets..." }));
          } else if (data.status === "filtering_relevant") {
            setAnalysisProgress(prev => ({ ...prev, [topicId]: `Filtering ${data.total_tweets} tweets...` }));
          } else if (data.status === "classifying") {
            setAnalysisProgress(prev => ({ ...prev, [topicId]: `Classifying: ${data.current}/${data.total}...` }));
          } else if (data.status === "saving") {
            setAnalysisProgress(prev => ({ ...prev, [topicId]: "Saving intelligence results..." }));
          } else if (data.status === "complete") {
            setAnalysisProgress(prev => { const next = { ...prev }; delete next[topicId]; return next; });
            cleanup();
            resolve(data.result);
          } else if (data.status === "error") {
            setAnalysisProgress(prev => { const next = { ...prev }; delete next[topicId]; return next; });
            cleanup();
            reject(new Error(data.message || "Error running analysis"));
          }
        } catch (err) {
          console.error("Error parsing SSE data", err);
        }
      };

      eventSource.onerror = (err) => {
        console.error("SSE error", err);
        cleanup();
        setAnalysisProgress(prev => { const next = { ...prev }; delete next[topicId]; return next; });
        reject(new Error("Connection error during analysis. Ensure ML backend is running."));
      };
    });
  };

  const handleRunAnalysis = async (topicId: string) => {
    setSubmittingProfile(prev => ({ ...prev, [topicId]: true }));
    try {
      const result = await runStreamAnalysis(topicId);
      if (result) {
        setIntelligenceMap(prev => ({
          ...prev,
          [topicId]: result
        }));
      }
    } catch (err: any) {
      if (err.message === "Analysis stopped by user.") return;
      console.error(err);
      alert(err.message || "Failed to analyze profile.");
    } finally {
      setSubmittingProfile(prev => ({ ...prev, [topicId]: false }));
    }
  };

  if (loading && !profile) {
    return (
      <div className="w-full flex items-center justify-center py-40">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  // Calculate specific metrics
  let activeTimeRange = "-";
  let activeTimeSub = "Weekdays";
  if (stats?.mostActivePostingHours?.[0]) {
    const peakHour = Number(stats.mostActivePostingHours[0].hour);
    const startHour = String((peakHour - 1 + 24) % 24).padStart(2, "0");
    const endHour = String((peakHour + 1) % 24).padStart(2, "0");
    activeTimeRange = `${startHour}:00 - ${endHour}:00`;

    // Days range calculation
    if (stats.mostActivePostingDays && stats.mostActivePostingDays.length > 0) {
      const dayNamesShort = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const isMonFriCount = stats.mostActivePostingDays
        .filter(d => d.dow >= 1 && d.dow <= 5)
        .reduce((sum, d) => sum + Number(d.count), 0);
      const isSatSunCount = stats.mostActivePostingDays
        .filter(d => d.dow === 6 || d.dow === 7)
        .reduce((sum, d) => sum + Number(d.count), 0);
      const totalDaysCount = stats.mostActivePostingDays.reduce((sum, d) => sum + Number(d.count), 0);

      if (totalDaysCount > 0) {
        if (isMonFriCount / totalDaysCount > 0.75) {
          activeTimeSub = "Weekdays (Mon-Fri)";
        } else if (isSatSunCount / totalDaysCount > 0.75) {
          activeTimeSub = "Weekends (Sat-Sun)";
        } else {
          // Construct custom range of top days
          const topDows = stats.mostActivePostingDays.slice(0, 3).map(d => Number(d.dow));
          topDows.sort((a, b) => a - b);
          if (topDows.length >= 2) {
            activeTimeSub = `${dayNamesShort[topDows[0]]}-${dayNamesShort[topDows[topDows.length - 1]]}`;
          } else {
            activeTimeSub = "All week";
          }
        }
      }
    }
  }

  let replyRatioStr = "-";
  if (stats?.reply_ratio) {
    const r = Number(stats.reply_ratio);
    if (r <= 0) {
      replyRatioStr = "0:1";
    } else if (r >= 1) {
      replyRatioStr = "1:0";
    } else {
      const originalPart = (1 - r) / r;
      replyRatioStr = `1 : ${originalPart.toFixed(1)}`;
    }
  }

  // Populate mock stats with database stats where data exists, leaving the rest as is
  const displayStats = [
    {
      label: "Avg. Tweets / Day",
      value: (
        <div className="flex items-baseline justify-between w-full mt-2 text-left gap-2 sm:gap-3">
          <div className="flex flex-col">
            <span className="text-[20px] font-bold text-[var(--text-primary)]">
              {stats?.avg_tweets_per_day_30d ? Number(stats.avg_tweets_per_day_30d).toFixed(1) : "0.0"}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mt-0.5">30 Days</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[20px] font-bold text-[var(--text-primary)]">
              {stats?.avg_tweets_per_day_1y ? Number(stats.avg_tweets_per_day_1y).toFixed(1) : "0.0"}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mt-0.5">1 Year</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[20px] font-bold text-[var(--text-primary)]">
              {stats?.avg_tweets_per_day_full ? Number(stats.avg_tweets_per_day_full).toFixed(1) : "0.0"}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mt-0.5">Full</span>
          </div>
        </div>
      ) as any,
      sub: "Average posts per day across intervals"
    },
    { label: "Engagement Rate", value: stats?.engagement_rate ? Number(stats.engagement_rate).toFixed(1) : "-", sub: "Replies + reposts + likes (sum)" },
    { label: "Average Likes", value: stats?.avg_likes ? Number(stats.avg_likes).toFixed(1) : "-", sub: "Per post" },
    { label: "Average Reposts", value: stats?.avg_retweets ? Number(stats.avg_retweets).toFixed(1) : "-", sub: "Per post" },
    { label: "Average Replies", value: stats?.avg_replies ? Number(stats.avg_replies).toFixed(1) : "-", sub: "Per post" },
    { label: "Most Active Time", value: activeTimeRange, sub: activeTimeSub },
    { label: "Reply / Original Ratio", value: replyRatioStr, sub: "Balanced mix" },
    { label: "Retweet Frequency", value: stats?.retweet_ratio ? `${Math.round(Number(stats.retweet_ratio) * 100)}%` : "-", sub: "Of all posts" },
  ];

  // Sort topics based on relevance_score descending if available
  const sortedTopicsList = [...topics].sort((a, b) => {
    const scoreA = intelligenceMap[a.id]?.relevance_score || 0;
    const scoreB = intelligenceMap[b.id]?.relevance_score || 0;
    return scoreB - scoreA;
  });

  // Map active hours to the 12-slot activity timeline chart
  const timelineData = Array.from({ length: 12 }, (_, i) => {
    const h1 = i * 2;
    const h2 = i * 2 + 1;
    const match1 = stats?.mostActivePostingHours?.find(h => Number(h.hour) === h1);
    const match2 = stats?.mostActivePostingHours?.find(h => Number(h.hour) === h2);
    const count = (match1 ? Number(match1.count) : 0) + (match2 ? Number(match2.count) : 0);
    return {
      label: `${String(h1).padStart(2, "0")}-${String(h2).padStart(2, "0")}`,
      value: count,
    };
  });

  return (
    <div className="w-full flex justify-center pt-20 pb-20 px-6 sm:pt-12 sm:pb-10 sm:px-4">
      <div className="w-full max-w-[960px] mx-auto flex flex-col gap-7 sm:gap-4">

        {/* 1. Header Section - Same look as Profile Card on Search Profile page */}
        {profile && (
          <div className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl overflow-hidden mb-2 shadow-sm">
            <div className="p-6 sm:px-4 sm:pt-[18px] sm:pb-0">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)] gap-4 sm:gap-3 items-center">
                {profile.profile_image_url && (
                  <div className="w-[76px] h-[76px] sm:w-16 sm:h-16 p-[3px] rounded-full bg-[var(--bg-surface)] border border-[var(--border)] shrink-0">
                    <img
                      src={profile.profile_image_url}
                      alt={profile.display_name || profile.username}
                      className="w-full h-full rounded-full object-cover border border-[var(--border)]"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="m-0 text-2xl sm:text-[22px] leading-[1.15] font-extrabold tracking-normal">
                    {profile.display_name || profile.username}
                  </h2>
                  <p className="mt-1 text-[var(--text-muted)] text-sm">@{profile.username}</p>
                </div>
              </div>

              {profile.bio && <p className="mt-5 text-[var(--text-primary)] text-[15px] leading-[1.7]">{profile.bio}</p>}

              <div className="flex flex-wrap gap-x-5 gap-y-2.5 mt-[18px] text-[var(--text-muted)] text-sm">
                {profile.location && <span className="inline-flex items-center gap-1.5">{profile.location}</span>}
                <span className="inline-flex items-center gap-1.5">Scraped {formatDate(profile.scraped_at)}</span>
              </div>

              <div className="grid grid-cols-4 gap-2.5 mt-[22px] pt-[22px] border-t border-[var(--border)] mb-6">
                <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]">
                  <span className="block text-[var(--text-primary)] text-lg leading-[1.2] font-extrabold">{formatNumber(profile.tweet_count)}</span>
                  <span className="block mt-1 text-[var(--text-muted)] text-xs">Tweets</span>
                </div>
                <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]">
                  <span className="block text-[var(--text-primary)] text-lg leading-[1.2] font-extrabold">{formatNumber(profile.followers_count)}</span>
                  <span className="block mt-1 text-[var(--text-muted)] text-xs">Followers</span>
                </div>
                <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]">
                  <span className="block text-[var(--text-primary)] text-lg leading-[1.2] font-extrabold">{formatNumber(profile.following_count)}</span>
                  <span className="block mt-1 text-[var(--text-muted)] text-xs">Following</span>
                </div>
                <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]">
                  <span className="block text-[var(--text-primary)] text-lg leading-[1.2] font-extrabold">{formatNumber(stats?.total_tweets || 0)}</span>
                  <span className="block mt-1 text-[var(--text-muted)] text-xs">Stored</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. Activity Overview Grid */}
        <div>
          <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[var(--text-muted)] mb-4">
            Activity Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {displayStats.map((stat, i) => (
              <StatCard key={i} stat={stat} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 3. Topic Analysis */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 lg:col-span-2">
            <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[var(--text-muted)] mb-5">
              Topic Concentration & Stance Analysis
            </h2>
            <div className="flex flex-col gap-4">
              {sortedTopicsList.map((topic, i) => {
                const result = intelligenceMap[topic.id];
                const isSubmitting = !!submittingProfile[topic.id];
                const progressMsg = analysisProgress[topic.id];

                return (
                  <div
                    key={topic.id}
                    className="flex flex-col p-4 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]/30 hover:bg-[var(--bg-subtle)]/60 transition-all duration-150"
                  >
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-muted)]">#{i + 1}</span>
                        <span className="text-sm font-extrabold text-[var(--text-primary)]">{topic.name}</span>
                      </div>
                      {result ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--text-secondary)]">
                            {Math.round(result.relevance_score * 100)}% relevance
                          </span>
                          <button
                            onClick={() => handleRunAnalysis(topic.id)}
                            disabled={isSubmitting}
                            title="Re-run stance classification"
                            className="bg-transparent border-none text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer flex items-center"
                          >
                            <RefreshCw size={11} className={isSubmitting ? "animate-spin" : ""} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">Un-analysed</span>
                      )}
                    </div>

                    {result ? (
                      <div className="flex flex-col gap-2">
                        {/* Stance indices */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-1">
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between text-[11px] font-medium text-[var(--text-secondary)]">
                              <span>Supportive Stance</span>
                              <span className="text-emerald-400 font-bold">{Math.round(result.supportive_score * 100)}%</span>
                            </div>
                            <div className="h-1.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                                style={{ width: `${result.supportive_score * 100}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between text-[11px] font-medium text-[var(--text-secondary)]">
                              <span>Opposition Stance</span>
                              <span className="text-red-400 font-bold">{Math.round(result.opposition_score * 100)}%</span>
                            </div>
                            <div className="h-1.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-red-500 rounded-full transition-all duration-300"
                                style={{ width: `${result.opposition_score * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Matching terms */}
                        {result.strongest_matching_terms && result.strongest_matching_terms.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 items-center mt-1">
                            <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Vocabulary:</span>
                            {result.strongest_matching_terms.slice(0, 4).map((term, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)] font-medium"
                              >
                                {term.text}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Sarcasm indicators */}
                        {result.sarcasm_confidence < 0.95 && (
                          <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-medium mt-0.5">
                            <AlertTriangle size={12} className="shrink-0" />
                            <span>Potential sarcasm cue detected (confidence: {Math.round(result.sarcasm_confidence * 100)}%)</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex justify-between items-center py-1 mt-1 border-t border-[var(--border-subtle)] border-dashed pt-2">
                        {isSubmitting ? (
                          <div className="flex items-center justify-between w-full gap-2">
                            <div className="text-xs text-[var(--accent)] font-semibold flex items-center gap-1.5 animate-pulse">
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              <span>{progressMsg || "Initializing ML classification..."}</span>
                            </div>
                            <button
                              onClick={() => stopStreamAnalysis(topic.id)}
                              className="px-2.5 py-1 text-[11px] font-bold rounded bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 cursor-pointer flex items-center gap-1 shrink-0"
                            >
                              <X size={12} /> Stop
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-xs text-[var(--text-muted)] italic">No classification data stored yet</span>
                            <button
                              onClick={() => handleRunAnalysis(topic.id)}
                              className="px-3 py-1 text-[11px] font-bold rounded bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 cursor-pointer shadow-sm transition-all"
                            >
                              Analyze Stance
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Comprehensive Profile Performance & Activity Timeline */}
          <div className="lg:col-span-2">
            <EngagementTimelineChart username={cleanUsername} />
          </div>
        </div>

        {/* 5. AI Classification status panel */}

      </div>
    </div>
  );
}

function StatCard({ stat }: { stat: { label: string; value: string | React.ReactNode; sub: string } }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col justify-between h-full hover:bg-[var(--bg-hover)] transition-colors duration-150 ease-in-out">
      <h3 className="text-[13px] font-medium text-[var(--text-secondary)] m-0">
        {stat.label}
      </h3>
      <div className="mt-3">
        {typeof stat.value === "string" ? (
          <p className="text-[24px] font-bold m-0 leading-none tracking-[-0.02em] text-[var(--text-primary)]">
            {stat.value}
          </p>
        ) : (
          stat.value
        )}
        <p className="text-[12px] text-[var(--text-muted)] mt-1.5 m-0 font-medium">
          {stat.sub}
        </p>
      </div>
    </div>
  );
}
