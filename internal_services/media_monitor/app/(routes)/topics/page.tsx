"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  fetchTopics,
  fetchProfiles,
  analyzeProfileForTopic,
  getProfileTopicIntelligence
} from "@/app/actions/topics";
import type { Topic } from "@/services/TopicRepository";
import {
  Search,
  Sparkles,
  Compass,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Eye,
  ArrowRight,
  TrendingUp,
  Sliders,
  Database,
  RefreshCw,
  AlertTriangle,
  Info,
  Calendar,
  X,
  Hash
} from "lucide-react";
import type { TopicIntelligenceResult } from "@/services/topicIntelligenceService";
import TopicMapModal from "@/components/maps/TopicMapModal";

interface DbProfileShort {
  id: number;
  username: string;
  display_name: string | null;
  profile_image_url: string | null;
  followers_count: string;
}

export default function TopicsShowcasePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center py-24">
          <RefreshCw className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      }
    >
      <TopicsShowcaseContent />
    </Suspense>
  );
}

function TopicsShowcaseContent() {
  const searchParams = useSearchParams();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [profiles, setProfiles] = useState<DbProfileShort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});

  // Intelligence dashboard state
  const [activeProfiles, setActiveProfiles] = useState<Record<string, string>>({}); // topicId -> username
  const [intelligenceResults, setIntelligenceResults] = useState<Record<string, TopicIntelligenceResult>>({}); // `${topicId}-${username}` -> result
  const [tweetTabs, setTweetTabs] = useState<Record<string, "supportive" | "opposition">>({});
  const [showDebug, setShowDebug] = useState<Record<string, boolean>>({});

  // Search profile input state per topic card
  const [profileInputs, setProfileInputs] = useState<Record<string, string>>({});
  const [profileFocus, setProfileFocus] = useState<Record<string, boolean>>({});

  // Map Modal State
  const [mapModalOpen, setMapModalOpen] = useState<Record<string, boolean>>({});

  // Action states
  const [submittingProfile, setSubmittingProfile] = useState<Record<string, boolean>>({});
  const [analysisProgress, setAnalysisProgress] = useState<Record<string, { message: string; percent: number }>>({});
  const [notification, setNotification] = useState<{ message: string; type: "success" | "info" } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [topicsData, profilesData] = await Promise.all([
        fetchTopics(),
        fetchProfiles()
      ]);
      setTopics(topicsData);
      setProfiles(profilesData as any[] || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load topics directory data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerNotification = (message: string, type: "success" | "info" = "info") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  const toggleExpand = (topicId: string) => {
    setExpandedTopics((prev) => ({
      ...prev,
      [topicId]: !prev[topicId]
    }));
  };

  const activeEventSourcesRef = useRef<Record<string, { es: EventSource; stop: () => void }>>({});

  const stopStreamAnalysis = (topicId: string) => {
    const entry = activeEventSourcesRef.current[topicId];
    if (entry) {
      entry.stop();
    }
    setSubmittingProfile(prev => ({ ...prev, [topicId]: false }));
    setAnalysisProgress(prev => { const next = { ...prev }; delete next[topicId]; return next; });
    triggerNotification("Analysis stopped by user.", "info");
  };

  const runStreamAnalysis = (username: string, topicId: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (activeEventSourcesRef.current[topicId]) {
        activeEventSourcesRef.current[topicId].stop();
      }
      const eventSource = new EventSource(`/api/intelligence/stream?username=${encodeURIComponent(username)}&topicId=${encodeURIComponent(topicId)}`);

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
            setAnalysisProgress(prev => ({
              ...prev,
              [topicId]: { message: "Fetching metadata...", percent: 15 }
            }));
          } else if (data.status === "fetching_tweets") {
            setAnalysisProgress(prev => ({
              ...prev,
              [topicId]: { message: "Fetching profile tweets...", percent: 35 }
            }));
          } else if (data.status === "filtering_relevant") {
            setAnalysisProgress(prev => ({
              ...prev,
              [topicId]: { message: `Filtering ${data.total_tweets || 0} tweets...`, percent: 55 }
            }));
          } else if (data.status === "classifying") {
            const current = data.current || 1;
            const total = Math.max(1, data.total || 1);
            const pct = Math.min(92, 60 + Math.floor((current / total) * 30));
            setAnalysisProgress(prev => ({
              ...prev,
              [topicId]: { message: `Classifying stance (${current}/${total})...`, percent: pct }
            }));
          } else if (data.status === "saving") {
            setAnalysisProgress(prev => ({
              ...prev,
              [topicId]: { message: "Saving results...", percent: 95 }
            }));
          } else if (data.status === "complete") {
            setAnalysisProgress(prev => { const next = { ...prev }; delete next[topicId]; return next; });
            cleanup();
            resolve({ ...data.result, profile: username });
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

  const handleProfileSearchSubmit = async (e: React.FormEvent, topicId: string, topicName: string) => {
    e.preventDefault();
    const inputVal = (profileInputs[topicId] || "").trim().replace(/^@/, "");
    if (!inputVal) {
      triggerNotification("Please enter or select a profile username first.", "info");
      return;
    }

    // Clear active profile for this topic so previous person's card is removed during search/analysis
    setActiveProfiles(prev => {
      const next = { ...prev };
      delete next[topicId];
      return next;
    });

    setSubmittingProfile(prev => ({ ...prev, [topicId]: true }));
    setAnalysisProgress(prev => ({
      ...prev,
      [topicId]: { message: "Initiating analysis...", percent: 5 }
    }));

    try {
      let result = await getProfileTopicIntelligence(inputVal, topicId);

      if (!result) {
        triggerNotification(`No cached analysis for @${inputVal}. Running full semantic vector analysis...`, "info");
        result = await runStreamAnalysis(inputVal, topicId);
      }

      if (result) {
        setIntelligenceResults(prev => ({
          ...prev,
          [`${topicId}-${inputVal.toLowerCase()}`]: result
        }));
        setActiveProfiles(prev => ({ ...prev, [topicId]: inputVal }));
        triggerNotification(`Topic based data loaded for @${inputVal}.`, "success");
      } else {
        triggerNotification(`No analysis results could be generated for @${inputVal}. Ensure they have tweets and embeddings.`, "info");
      }
    } catch (err: any) {
      if (err.message === "Analysis stopped by user.") return;
      console.error(err);
      triggerNotification(err.message || "Failed to analyze profile.", "info");
    } finally {
      setSubmittingProfile(prev => ({ ...prev, [topicId]: false }));
      setAnalysisProgress(prev => { const next = { ...prev }; delete next[topicId]; return next; });
    }
  };

  const handleRefreshIntelligence = async (topicId: string, username: string) => {
    setSubmittingProfile(prev => ({ ...prev, [topicId]: true }));
    setAnalysisProgress(prev => ({
      ...prev,
      [topicId]: { message: `Re-running analysis for @${username}...`, percent: 10 }
    }));

    try {
      triggerNotification(`Running full semantic vector analysis for @${username}...`, "info");
      const result = await runStreamAnalysis(username, topicId);
      if (result) {
        setIntelligenceResults(prev => ({
          ...prev,
          [`${topicId}-${username.toLowerCase()}`]: result
        }));
        triggerNotification(`Topic based data refreshed for @${username}.`, "success");
      } else {
        triggerNotification(`Failed to refresh analysis for @${username}.`, "info");
      }
    } catch (err: any) {
      if (err.message === "Analysis stopped by user.") return;
      console.error(err);
      triggerNotification(err.message || "Failed to refresh profile.", "info");
    } finally {
      setSubmittingProfile(prev => ({ ...prev, [topicId]: false }));
      setAnalysisProgress(prev => { const next = { ...prev }; delete next[topicId]; return next; });
    }
  };

  const filteredTopics = topics.filter((topic) => {
    return topic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (topic.semantic_queries || []).some(q => q.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  return (
    <div className="w-full flex justify-center pt-20 pb-20 px-6 sm:pt-12 sm:pb-10 sm:px-4 bg-[var(--bg-base)] min-h-[calc(100vh-56px)] text-[var(--text-primary)] font-sans">
      {notification && (
        <div className={`fixed bottom-6 right-6 z-[1000] backdrop-blur-md text-white py-3.5 px-5 rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3)] flex items-center gap-2.5 text-sm font-semibold max-w-[450px] border border-white/15 animate-[slideIn_0.3s_ease-out] ${notification.type === "success" ? "bg-emerald-500/95" : "bg-[var(--accent)]"}`}>
          {notification.type === "success" ? <CheckCircle size={18} /> : <Compass size={18} />}
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="bg-transparent border-none text-white cursor-pointer ml-auto p-0 flex opacity-80 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      <div className="w-full max-w-[960px] mx-auto flex flex-col gap-9 page-container">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight m-0">Topics & Keyword Intelligence</h1>
            <p className="text-sm text-[var(--text-secondary)] m-0">
              Explore semantic vectors, saved classification rules, or inspect database keyword intelligence.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-4 bg-white/5 border border-[var(--border)] rounded-xl py-4 px-5 backdrop-blur-md">
              <div className="relative flex-1 max-w-[450px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
                  <Search size={16} />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search topics or queries..."
                  className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg py-2 pr-3 pl-9 text-sm w-full outline-none transition-colors duration-150 focus:border-[var(--accent)]"
                />
              </div>

              <Link
                href="/manage-topics"
                className="min-h-[38px] px-4 border border-[var(--border)] rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] text-[13px] font-semibold cursor-pointer inline-flex items-center justify-center gap-2 no-underline transition-all duration-150 hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] shrink-0"
              >
                Manage Topics
              </Link>
            </div>

            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-9 h-9 rounded-full border-[3px] border-[var(--border)] border-t-[var(--accent)] animate-spin" />
                <span className="text-sm text-[var(--text-secondary)]">Loading data for profiles...</span>
              </div>
            )}

            {error && (
              <div className="bg-red-500/5 border border-red-500/15 rounded-xl py-4 px-5 text-red-400 text-sm flex items-center gap-3">
                <XCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {!loading && !error && (
              <>
                {filteredTopics.length === 0 ? (
                  <div className="bg-[var(--bg-surface)] border border-dashed border-[var(--border)] rounded-2xl py-15 px-10 text-center flex flex-col items-center gap-3">
                    <Compass size={36} className="text-[var(--text-muted)]" />
                    <span className="text-base font-semibold">No topics found</span>
                    <span className="text-[13px] text-[var(--text-muted)] max-w-[400px]">
                      We couldn't find any topics matching your active search filters. Create one under /manage-topics.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-7">
                    {filteredTopics.map((topic) => {
                      const queryCount = topic.semantic_queries?.length || 0;
                      const negCount = topic.negative_semantics?.length || 0;
                      const posSarcasmCount = topic.positive_sarcasm_cues?.length || 0;
                      const negSarcasmCount = topic.negative_sarcasm_cues?.length || 0;
                      const totalRules = queryCount + negCount + posSarcasmCount + negSarcasmCount;

                      const isExpanded = !!expandedTopics[topic.id];
                      const searchVal = profileInputs[topic.id] || "";
                      const inputFocused = !!profileFocus[topic.id];

                      const matchingProfiles = profiles.filter(p =>
                        p.username.toLowerCase().includes(searchVal.toLowerCase()) ||
                        (p.display_name && p.display_name.toLowerCase().includes(searchVal.toLowerCase()))
                      ).slice(0, 5);

                      return (
                        <article
                          key={topic.id}
                          className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 pb-7 flex flex-col gap-5 relative overflow-visible shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-all duration-250 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(0,0,0,0.12)] hover:border-purple-400/25"
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex flex-col gap-1">
                              <h2 className="text-lg font-bold m-0 tracking-tight text-[var(--text-primary)]">
                                {topic.name}
                              </h2>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[11px] text-[var(--text-secondary)] font-medium flex items-center gap-1">
                                  <Sliders size={11} /> Threshold: {topic.similarity_threshold.toFixed(2)}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => setMapModalOpen(prev => ({ ...prev, [topic.id]: true }))}
                              className="bg-blue-500/10 border border-blue-500/30 rounded-xl py-1 px-2.5 text-[11px] font-bold text-blue-500 flex items-center gap-1 cursor-pointer transition-colors duration-200 hover:bg-blue-500/20"
                            >
                              <Compass size={11} /> View Results
                            </button>
                          </div>
                          <TopicMapModal
                            topicId={topic.id}
                            topicName={topic.name}
                            isOpen={!!mapModalOpen[topic.id]}
                            onClose={() => setMapModalOpen(prev => ({ ...prev, [topic.id]: false }))}
                            initialSearchPerson={activeProfiles[topic.id] || profileInputs[topic.id] || ""}
                          />

                          <div className="grid grid-cols-2 gap-2.5 bg-[var(--bg-subtle)] p-3 rounded-xl border border-[var(--border)]">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Queries</span>
                              <span className="text-[13px] font-bold text-[var(--text-secondary)]">{queryCount} matching</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Exclusions</span>
                              <span className="text-[13px] font-bold text-[var(--text-secondary)]">{negCount} filters</span>
                            </div>
                            <div className="flex flex-col gap-0.5 mt-1">
                              <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Sarcasm Cues (+)</span>
                              <span className="text-[13px] font-bold text-[var(--text-secondary)]">{posSarcasmCount} cues</span>
                            </div>
                            <div className="flex flex-col gap-0.5 mt-1">
                              <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Sarcasm Cues (-)</span>
                              <span className="text-[13px] font-bold text-[var(--text-secondary)]">{negSarcasmCount} cues</span>
                            </div>
                          </div>

                          <div className="border-t border-[var(--border)] pt-3.5">
                            <button
                              onClick={() => toggleExpand(topic.id)}
                              className="flex items-center justify-between gap-1.5 bg-transparent border-none text-[var(--text-secondary)] text-xs font-semibold cursor-pointer w-full p-0"
                            >
                              <span className="flex items-center gap-1.5">
                                <Eye size={13} />
                                {isExpanded ? "Hide semantic rule terms" : "Show semantic rule terms"}
                              </span>
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            {isExpanded && (
                              <div className="flex flex-col gap-3 mt-3 animate-[fadeIn_0.2s_ease]">
                                {queryCount > 0 && (
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] text-[var(--accent)] font-bold uppercase">Semantic Queries</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {topic.semantic_queries.map((q, idx) => (
                                        <span key={idx} className="text-[11px] bg-purple-500/10 border border-purple-500/15 text-[var(--accent)] py-0.5 px-2 rounded-md">
                                          {q}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {negCount > 0 && (
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] text-red-400 font-bold uppercase">Exclusions (Negatives)</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {topic.negative_semantics.map((q, idx) => (
                                        <span key={idx} className="text-[11px] bg-red-500/10 border border-red-500/15 text-red-400 py-0.5 px-2 rounded-md">
                                          {q}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {(posSarcasmCount > 0 || negSarcasmCount > 0) && (
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] text-blue-400 font-bold uppercase">Sarcasm Filters</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {[...(topic.positive_sarcasm_cues || []), ...(topic.negative_sarcasm_cues || [])].map((q, idx) => (
                                        <span key={idx} className="text-[11px] bg-blue-500/10 border border-blue-500/15 text-blue-400 py-0.5 px-2 rounded-md">
                                          {q}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {totalRules === 0 && (
                                  <span className="text-[11px] text-[var(--text-muted)] italic">
                                    No semantic terms configured for this topic.
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="border-t border-[var(--border)] pt-4 flex flex-col gap-2 relative">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1">
                              Profile Explorer <span className="text-[9px] text-[var(--text-muted)] font-medium">(Mock analysis view)</span>
                            </label>

                            <form
                              onSubmit={(e) => handleProfileSearchSubmit(e, topic.id, topic.name)}
                              className="flex gap-2 relative"
                            >
                              <div className="relative flex-1">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text-muted)] select-none">
                                  @
                                </span>
                                <input
                                  type="text"
                                  value={searchVal}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setProfileInputs(prev => ({ ...prev, [topic.id]: val }));
                                    // Instantly clear old active profile card if input handle changes
                                    const cleanInput = val.trim().replace(/^@/, "").toLowerCase();
                                    const currentActive = activeProfiles[topic.id]?.toLowerCase();
                                    if (currentActive && currentActive !== cleanInput) {
                                      setActiveProfiles(prev => {
                                        const next = { ...prev };
                                        delete next[topic.id];
                                        return next;
                                      });
                                    }
                                  }}
                                  onFocus={() => {
                                    setProfileFocus(prev => ({ ...prev, [topic.id]: true }));
                                  }}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      setProfileFocus(prev => ({ ...prev, [topic.id]: false }));
                                    }, 200);
                                  }}
                                  placeholder="mohakmangal"
                                  className={`bg-[var(--bg-subtle)] border text-[var(--text-primary)] rounded-lg py-2 pr-2 pl-6 text-[13px] w-full outline-none transition-all duration-150 ${inputFocused ? "border-[var(--accent)] shadow-[0_0_0_2px_rgba(168,85,247,0.15)]" : "border-[var(--border)]"
                                    }`}
                                />

                                {inputFocused && searchVal.trim() && matchingProfiles.length > 0 && (
                                  <div className="absolute bottom-full left-0 right-0 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-[0_-8px_20px_rgba(0,0,0,0.15)] z-10 mb-1.5 overflow-hidden animate-[fadeIn_0.15s_ease]">
                                    {matchingProfiles.map((p) => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          setProfileInputs(prev => ({ ...prev, [topic.id]: p.username }));
                                          setProfileFocus(prev => ({ ...prev, [topic.id]: false }));
                                        }}
                                        className="w-full py-2 px-3 text-left bg-transparent border-none border-b border-[var(--border)] text-[var(--text-primary)] text-xs cursor-pointer flex items-center gap-2 transition-colors duration-150 hover:bg-[var(--bg-hover)]"
                                      >
                                        {p.profile_image_url ? (
                                          <img
                                            src={p.profile_image_url}
                                            alt={p.username}
                                            className="w-[18px] h-[18px] rounded-full object-cover"
                                            onError={(e) => {
                                              (e.target as HTMLElement).style.display = "none";
                                            }}
                                          />
                                        ) : (
                                          <div className="w-[18px] h-[18px] rounded-full bg-[var(--border)] text-[10px] flex items-center justify-center">
                                            {p.username[0]?.toUpperCase()}
                                          </div>
                                        )}
                                        <div className="flex flex-col">
                                          <span className="font-semibold">@{p.username}</span>
                                          {p.display_name && (
                                            <span className="text-[10px] text-[var(--text-muted)]">{p.display_name}</span>
                                          )}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {submittingProfile[topic.id] ? (
                                <button
                                  type="button"
                                  onClick={() => stopStreamAnalysis(topic.id)}
                                  className="border border-red-500/40 rounded-lg px-3.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-150 text-red-400 bg-red-500/15 hover:bg-red-500/25 cursor-pointer shrink-0"
                                >
                                  <X size={13} />
                                  <span>Stop</span>
                                </button>
                              ) : (
                                <button
                                  type="submit"
                                  disabled={submittingProfile[topic.id]}
                                  className="border-none rounded-lg px-3.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-150 text-white bg-[var(--accent)] cursor-pointer shadow-[0_4px_10px_rgba(168,85,247,0.15)] hover:bg-[#9333ea] shrink-0"
                                >
                                  <span>Explore</span>
                                  <ArrowRight size={13} />
                                </button>
                              )}
                            </form>

                            {analysisProgress[topic.id] && (
                              <div className="flex flex-col gap-1.5 mt-2.5 p-2.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-[var(--text-secondary)] font-medium flex items-center gap-1.5">
                                    <RefreshCw size={12} className="animate-spin shrink-0 text-[var(--accent)]" />
                                    <span>{analysisProgress[topic.id].message}</span>
                                  </span>
                                  <span className="text-[var(--text-primary)] font-semibold text-xs font-mono shrink-0">
                                    {analysisProgress[topic.id].percent}%
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[var(--accent)] rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${analysisProgress[topic.id].percent}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          {activeProfiles[topic.id] && (
                            (() => {
                              const activeUsername = activeProfiles[topic.id];
                              const result = intelligenceResults[`${topic.id}-${activeUsername.toLowerCase()}`];
                              if (!result) return null;

                              const currentActiveTab = tweetTabs[topic.id] || "supportive";
                              const sampleTweets = currentActiveTab === "supportive"
                                ? result.sample_supportive_tweets
                                : result.sample_opposition_tweets;

                              return (
                                <div className="flex flex-col gap-4 border-t border-[var(--border)] pt-5 animate-[fadeIn_0.3s_ease] relative">
                                  <div className="flex justify-between items-start gap-3">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[13px] font-bold text-[var(--text-primary)]">
                                        Intelligence Core: @{result.profile}
                                      </span>
                                      <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                                        <Calendar size={10} />
                                        Last analyzed: {new Date(result.analyzed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleRefreshIntelligence(topic.id, activeUsername)}
                                        title="Re-run Analysis"
                                        disabled={submittingProfile[topic.id]}
                                        className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-secondary)] rounded-md p-1.5 cursor-pointer flex items-center justify-center transition-colors duration-150 hover:border-[var(--accent)]"
                                      >
                                        <RefreshCw size={13} className={submittingProfile[topic.id] ? "animate-spin" : ""} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveProfiles(prev => {
                                            const next = { ...prev };
                                            delete next[topic.id];
                                            return next;
                                          });
                                        }}
                                        title="Close Dashboard"
                                        className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-secondary)] rounded-md p-1.5 cursor-pointer flex items-center justify-center transition-colors duration-150 hover:border-red-400"
                                      >
                                        <X size={13} />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-3">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex justify-between text-[11px] font-semibold">
                                        <span className="text-[var(--text-secondary)]">Topic Relevance</span>
                                        <span className="text-purple-400">{(result.relevance_score * 100).toFixed(0)}%</span>
                                      </div>
                                      <div className="h-1.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full" style={{ width: `${result.relevance_score * 100}%` }} />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="flex flex-col gap-1">
                                        <div className="flex justify-between text-[11px] font-semibold">
                                          <span className="text-[var(--text-secondary)]">Supportive Stance</span>
                                          <span className="text-emerald-400">{(result.supportive_score * 100).toFixed(0)}%</span>
                                        </div>
                                        <div className="h-1.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-full overflow-hidden">
                                          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style={{ width: `${result.supportive_score * 100}%` }} />
                                        </div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <div className="flex justify-between text-[11px] font-semibold">
                                          <span className="text-[var(--text-secondary)]">Opposition Stance</span>
                                          <span className="text-red-400">{(result.opposition_score * 100).toFixed(0)}%</span>
                                        </div>
                                        <div className="h-1.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-full overflow-hidden">
                                          <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full" style={{ width: `${result.opposition_score * 100}%` }} />
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {result.sarcasm_confidence < 0.95 && (
                                    <div className="flex items-center gap-2 p-2 bg-amber-500/5 border border-amber-500/15 rounded-lg text-amber-400 text-[11px] leading-tight">
                                      <AlertTriangle size={14} className="shrink-0" />
                                      <span>
                                        Stance modulated by sarcasm cues (sarcasm confidence: {(result.sarcasm_confidence * 100).toFixed(0)}%). Lower confidence indicates high ambiguity.
                                      </span>
                                    </div>
                                  )}

                                  <div className="flex flex-col gap-0.5 bg-white/5 border border-[var(--border)] rounded-xl p-2.5">
                                    <div className="flex justify-between text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                                      <span>Topic Coverage</span>
                                      <span>{result.tweet_coverage_percent.toFixed(1)}%</span>
                                    </div>
                                    <span className="text-xs font-bold text-[var(--text-secondary)]">
                                      {result.matching_tweets_count} of {result.total_tweets_analyzed} tweets matched
                                    </span>
                                  </div>

                                  {result.strongest_matching_terms && result.strongest_matching_terms.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                      <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase">
                                        Strongest Matching Terms
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {result.strongest_matching_terms.map((term, idx) => {
                                          let bg = "bg-purple-500/5";
                                          let border = "border border-purple-500/15";
                                          let color = "text-[var(--accent)]";

                                          if (term.field_name === "negative_semantics") {
                                            bg = "bg-red-500/5";
                                            border = "border border-red-500/15";
                                            color = "text-red-400";
                                          } else if (term.field_name.includes("sarcasm")) {
                                            bg = "bg-amber-500/5";
                                            border = "border border-amber-500/15";
                                            color = "text-amber-400";
                                          }

                                          return (
                                            <span
                                              key={idx}
                                              className={`text-[10px] py-0.5 px-2 rounded-md font-medium flex items-center gap-1 ${bg} ${border} ${color}`}
                                            >
                                              <span>{term.text}</span>
                                              <span className="opacity-70 text-[9px]">{term.avg_similarity.toFixed(2)}</span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex flex-col gap-2">
                                    <div className="flex gap-3 border-b border-[var(--border)] pb-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setTweetTabs(prev => ({ ...prev, [topic.id]: "supportive" }))}
                                        className={`bg-transparent border-none font-semibold text-[11px] pb-1.5 cursor-pointer ${currentActiveTab === "supportive"
                                          ? "text-[var(--text-primary)] border-b-2 border-emerald-500"
                                          : "text-[var(--text-muted)] border-b-2 border-transparent"
                                          }`}
                                      >
                                        Supportive ({result.sample_supportive_tweets.length})
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setTweetTabs(prev => ({ ...prev, [topic.id]: "opposition" }))}
                                        className={`bg-transparent border-none font-semibold text-[11px] pb-1.5 cursor-pointer ${currentActiveTab === "opposition"
                                          ? "text-[var(--text-primary)] border-b-2 border-red-500"
                                          : "text-[var(--text-muted)] border-b-2 border-transparent"
                                          }`}
                                      >
                                        Opposition ({result.sample_opposition_tweets.length})
                                      </button>
                                    </div>

                                    <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                                      {sampleTweets.length === 0 ? (
                                        <span className="text-[11px] text-[var(--text-muted)] italic py-2.5">
                                          No matching tweets detected for this category.
                                        </span>
                                      ) : (
                                        sampleTweets.map((tweet, idx) => (
                                          <div
                                            key={idx}
                                            className="bg-white/5 border border-[var(--border)] rounded-lg p-2.5 flex flex-col gap-1.5"
                                          >
                                            <span className="text-xs text-[var(--text-secondary)] leading-snug">
                                              "{tweet.text}"
                                            </span>
                                            <div className="flex gap-2 text-[9px] text-[var(--text-muted)]">
                                              <span className={currentActiveTab === "supportive" ? "text-emerald-400" : "text-red-400"}>
                                                Pos: {tweet.positive_signal.toFixed(2)}
                                              </span>
                                              <span>•</span>
                                              <span className="text-red-500">
                                                Neg: {tweet.negative_signal.toFixed(2)}
                                              </span>
                                              {tweet.sarcasm_signal > 0 && (
                                                <>
                                                  <span>•</span>
                                                  <span className="text-amber-400">
                                                    Sarcasm: {tweet.sarcasm_signal.toFixed(2)}
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>

                                  <div className="border-t border-dashed border-[var(--border)] pt-2.5">
                                    <button
                                      type="button"
                                      onClick={() => setShowDebug(prev => ({ ...prev, [topic.id]: !prev[topic.id] }))}
                                      className="flex items-center gap-1.5 bg-transparent border-none text-[var(--text-muted)] text-[10px] font-semibold cursor-pointer p-0"
                                    >
                                      <Sliders size={11} />
                                      {showDebug[topic.id] ? "Hide raw signals breakdown" : "Show raw signals breakdown"}
                                    </button>
                                    {showDebug[topic.id] && (
                                      <pre className="bg-black/20 border border-[var(--border)] rounded-md p-2 mt-2 text-[10px] font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                                        {JSON.stringify(result.debug_signals, null, 2)}
                                      </pre>
                                    )}
                                  </div>
                                </div>
                              );
                            })()
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
