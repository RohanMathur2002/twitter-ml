"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
  X
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
  const [topics, setTopics] = useState<Topic[]>([]);
  const [profiles, setProfiles] = useState<DbProfileShort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "active" | "inactive">("all");
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
  const [analysisProgress, setAnalysisProgress] = useState<Record<string, string>>({});
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

  const runStreamAnalysis = (username: string, topicId: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(`/api/intelligence/stream?username=${encodeURIComponent(username)}&topicId=${encodeURIComponent(topicId)}`);
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.status === "fetching_metadata") {
            setAnalysisProgress(prev => ({ ...prev, [topicId]: "Fetching topic metadata..." }));
          } else if (data.status === "fetching_tweets") {
            setAnalysisProgress(prev => ({ ...prev, [topicId]: "Fetching profile tweets..." }));
          } else if (data.status === "filtering_relevant") {
            setAnalysisProgress(prev => ({ ...prev, [topicId]: `Filtering ${data.total_tweets} tweets for relevance...` }));
          } else if (data.status === "classifying") {
            setAnalysisProgress(prev => ({ ...prev, [topicId]: `Running ML Classification: ${data.current}/${data.total} tweets...` }));
          } else if (data.status === "saving") {
            setAnalysisProgress(prev => ({ ...prev, [topicId]: "Saving intelligence results..." }));
          } else if (data.status === "complete") {
            setAnalysisProgress(prev => { const next = {...prev}; delete next[topicId]; return next; });
            eventSource.close();
            resolve({ ...data.result, profile: username });
          } else if (data.status === "error") {
            setAnalysisProgress(prev => { const next = {...prev}; delete next[topicId]; return next; });
            eventSource.close();
            reject(new Error(data.message || "Error running analysis"));
          }
        } catch (err) {
          console.error("Error parsing SSE data", err);
        }
      };

      eventSource.onerror = (err) => {
        console.error("SSE error", err);
        eventSource.close();
        setAnalysisProgress(prev => { const next = {...prev}; delete next[topicId]; return next; });
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

    setSubmittingProfile(prev => ({ ...prev, [topicId]: true }));
    try {
      // 1. Try to get cached intelligence
      let result = await getProfileTopicIntelligence(inputVal, topicId);
      
      // 2. If not found in cache, run the full analysis
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
        triggerNotification(`Topic intelligence loaded for @${inputVal}.`, "success");
      } else {
        triggerNotification(`No analysis results could be generated for @${inputVal}. Ensure they have tweets and embeddings.`, "info");
      }
    } catch (err: any) {
      console.error(err);
      triggerNotification(err.message || "Failed to analyze profile.", "info");
    } finally {
      setSubmittingProfile(prev => ({ ...prev, [topicId]: false }));
    }
  };

  const handleRefreshIntelligence = async (topicId: string, username: string) => {
    setSubmittingProfile(prev => ({ ...prev, [topicId]: true }));
    try {
      triggerNotification(`Running full semantic vector analysis for @${username}...`, "info");
      const result = await runStreamAnalysis(username, topicId);
      if (result) {
        setIntelligenceResults(prev => ({
          ...prev,
          [`${topicId}-${username.toLowerCase()}`]: result
        }));
        triggerNotification(`Topic intelligence refreshed for @${username}.`, "success");
      } else {
        triggerNotification(`Failed to refresh analysis for @${username}.`, "info");
      }
    } catch (err: any) {
      console.error(err);
      triggerNotification(err.message || "Failed to refresh profile.", "info");
    } finally {
      setSubmittingProfile(prev => ({ ...prev, [topicId]: false }));
    }
  };

  // Filter topics based on search & tab
  const filteredTopics = topics.filter((topic) => {
    const matchesSearch = topic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (topic.semantic_queries || []).some(q => q.toLowerCase().includes(searchQuery.toLowerCase()));

    if (activeTab === "active") return matchesSearch && topic.is_active;
    if (activeTab === "inactive") return matchesSearch && !topic.is_active;
    return matchesSearch;
  });

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "48px 24px",
        backgroundColor: "var(--bg-base)",
        minHeight: "calc(100vh - 56px)",
        color: "var(--text-primary)",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      }}
    >
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1000,
            background: notification.type === "success" ? "rgba(16,185,129,0.95)" : "var(--accent)",
            backdropFilter: "blur(8px)",
            color: "#fff",
            padding: "14px 20px",
            borderRadius: 12,
            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 14,
            fontWeight: 600,
            maxWidth: 450,
            animation: "slideIn 0.3s ease-out",
            border: "1px solid rgba(255,255,255,0.15)"
          }}
        >
          {notification.type === "success" ? <CheckCircle size={18} /> : <Compass size={18} />}
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              marginLeft: "auto",
              padding: 0,
              display: "flex",
              opacity: 0.8
            }}
          >
            &times;
          </button>
        </div>
      )}

      <div
        className="page-container"
        style={{
          width: "100%",
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 36
        }}
      >
        {/* Page Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            borderBottom: "1px solid var(--border)",
            paddingBottom: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                margin: 0,
              }}
            >
              Topics Showcase
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
              Explore semantic vectors, run classification rules, and analyze profiles.
            </p>
          </div>
          
          <Link
            href="/manage-topics"
            style={{
              minHeight: 38,
              padding: "0 16px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              textDecoration: "none",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.background = "var(--accent-subtle)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.background = "var(--bg-surface)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
          >
            Manage Topics
          </Link>
        </div>

        {/* Filter Toolbar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 20px",
            backdropFilter: "blur(6px)"
          }}
        >
          {/* Tab Selector */}
          <div style={{ display: "flex", gap: 6, background: "var(--bg-subtle)", padding: 4, borderRadius: 8 }}>
            {(["all", "active", "inactive"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? "var(--bg-surface)" : "transparent",
                  color: activeTab === tab ? "var(--text-primary)" : "var(--text-secondary)",
                  border: activeTab === tab ? "1px solid var(--border)" : "1px solid transparent",
                  borderRadius: 6,
                  padding: "6px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  transition: "all 0.15s ease",
                  boxShadow: activeTab === tab ? "0 2px 8px rgba(0,0,0,0.08)" : "none"
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search bar input */}
          <div style={{ position: "relative", width: "100%", maxWidth: 350 }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "1/2",
                transform: "translateY(10px)",
                color: "var(--text-muted)",
                pointerEvents: "none"
              }}
            >
              <Search size={16} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics or queries..."
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                borderRadius: 8,
                padding: "8px 12px 8px 36px",
                fontSize: 14,
                width: "100%",
                outline: "none",
                transition: "border-color 0.15s ease"
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 16 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                border: "3px solid var(--border)",
                borderTopColor: "var(--accent)",
                animation: "spin 1s linear infinite"
              }}
            />
            <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Loading intelligence profiles...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.15)",
              borderRadius: 12,
              padding: "16px 20px",
              color: "#f87171",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 12
            }}
          >
            <XCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Grid List */}
        {!loading && !error && (
          <>
            {filteredTopics.length === 0 ? (
              <div
                style={{
                  background: "var(--bg-surface)",
                  border: "1px dashed var(--border)",
                  borderRadius: 16,
                  padding: "60px 40px",
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12
                }}
              >
                <Compass size={36} style={{ color: "var(--text-muted)" }} />
                <span style={{ fontSize: 16, fontWeight: 600 }}>No topics found</span>
                <span style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 400 }}>
                  We couldn't find any topics matching your active search filters. Create one under /manage-topics.
                </span>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
                  gap: 28
                }}
              >
                {filteredTopics.map((topic) => {
                  const queryCount = topic.semantic_queries?.length || 0;
                  const negCount = topic.negative_semantics?.length || 0;
                  const posSarcasmCount = topic.positive_sarcasm_cues?.length || 0;
                  const negSarcasmCount = topic.negative_sarcasm_cues?.length || 0;
                  const totalRules = queryCount + negCount + posSarcasmCount + negSarcasmCount;

                  const isExpanded = !!expandedTopics[topic.id];
                  const searchVal = profileInputs[topic.id] || "";
                  const inputFocused = !!profileFocus[topic.id];

                  // Filter local profiles for dropdown autocomplete
                  const matchingProfiles = profiles.filter(p =>
                    p.username.toLowerCase().includes(searchVal.toLowerCase()) ||
                    (p.display_name && p.display_name.toLowerCase().includes(searchVal.toLowerCase()))
                  ).slice(0, 5);

                  return (
                    <article
                      key={topic.id}
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 16,
                        padding: "24px 24px 28px 24px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 20,
                        position: "relative",
                        overflow: "visible",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-4px)";
                        e.currentTarget.style.boxShadow = "0 12px 30px rgba(0,0,0,0.12)";
                        e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.25)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.05)";
                        e.currentTarget.style.borderColor = "var(--border)";
                      }}
                    >
                      {/* Topic Header: Name & Status */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <h2
                            style={{
                              fontSize: 18,
                              fontWeight: 700,
                              margin: 0,
                              letterSpacing: "-0.02em",
                              color: "var(--text-primary)"
                            }}
                          >
                            {topic.name}
                          </h2>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: 11,
                                color: topic.is_active ? "#34d399" : "var(--text-muted)",
                                fontWeight: 600
                              }}
                            >
                              {topic.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                              {topic.is_active ? "Active Link" : "Paused"}
                            </span>
                            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--border)" }} />
                            <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500, display: "flex", alignItems: "center", gap: 3 }}>
                              <Sliders size={11} /> Threshold: {topic.similarity_threshold.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* Total Rules Badge */}
                        <div
                          style={{
                            background: "rgba(168,85,247,0.08)",
                            border: "1px solid rgba(168,85,247,0.15)",
                            borderRadius: 12,
                            padding: "4px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "var(--accent)",
                            display: "flex",
                            alignItems: "center",
                            gap: 4
                          }}
                        >
                          <Database size={11} /> {totalRules} {totalRules === 1 ? "rule" : "rules"}
                        </div>
                        <button
                          onClick={() => setMapModalOpen(prev => ({ ...prev, [topic.id]: true }))}
                          style={{
                            background: "rgba(59, 130, 246, 0.1)",
                            border: "1px solid rgba(59, 130, 246, 0.3)",
                            borderRadius: 12,
                            padding: "4px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#3b82f6",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            cursor: "pointer",
                            transition: "all 0.2s"
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(59, 130, 246, 0.2)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(59, 130, 246, 0.1)"}
                        >
                          <Compass size={11} /> View Map
                        </button>
                      </div>
                      <TopicMapModal
                        topicId={topic.id}
                        topicName={topic.name}
                        isOpen={!!mapModalOpen[topic.id]}
                        onClose={() => setMapModalOpen(prev => ({ ...prev, [topic.id]: false }))}
                      />

                      {/* Rule Counters Badges Grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 10,
                          background: "var(--bg-subtle)",
                          padding: 12,
                          borderRadius: 12,
                          border: "1px solid var(--border)"
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Queries</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>{queryCount} matching</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Exclusions</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>{negCount} filters</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Sarcasm Cues (+)</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>{posSarcasmCount} cues</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Sarcasm Cues (-)</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>{negSarcasmCount} cues</span>
                        </div>
                      </div>

                      {/* Accordion Collapsible Detail list */}
                      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                        <button
                          onClick={() => toggleExpand(topic.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            background: "none",
                            border: "none",
                            color: "var(--text-secondary)",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            width: "100%",
                            padding: 0,
                            justifyContent: "space-between"
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Eye size={13} />
                            {isExpanded ? "Hide semantic rule terms" : "Show semantic rule terms"}
                          </span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {isExpanded && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12, animation: "fadeIn 0.2s ease" }}>
                            {/* Queries List */}
                            {queryCount > 0 && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, textTransform: "uppercase" }}>Semantic Queries</span>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {topic.semantic_queries.map((q, idx) => (
                                    <span
                                      key={idx}
                                      style={{
                                        fontSize: 11,
                                        background: "rgba(168,85,247,0.06)",
                                        border: "1px solid rgba(168,85,247,0.12)",
                                        color: "var(--accent)",
                                        padding: "2px 8px",
                                        borderRadius: 6
                                      }}
                                    >
                                      {q}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Negative List */}
                            {negCount > 0 && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontSize: 10, color: "#f87171", fontWeight: 700, textTransform: "uppercase" }}>Exclusions (Negatives)</span>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {topic.negative_semantics.map((q, idx) => (
                                    <span
                                      key={idx}
                                      style={{
                                        fontSize: 11,
                                        background: "rgba(239,68,68,0.06)",
                                        border: "1px solid rgba(239,68,68,0.12)",
                                        color: "#f87171",
                                        padding: "2px 8px",
                                        borderRadius: 6
                                      }}
                                    >
                                      {q}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Sarcasm Lists */}
                            {(posSarcasmCount > 0 || negSarcasmCount > 0) && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontSize: 10, color: "#60a5fa", fontWeight: 700, textTransform: "uppercase" }}>Sarcasm Filters</span>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {[...(topic.positive_sarcasm_cues || []), ...(topic.negative_sarcasm_cues || [])].map((q, idx) => (
                                    <span
                                      key={idx}
                                      style={{
                                        fontSize: 11,
                                        background: "rgba(96,165,250,0.06)",
                                        border: "1px solid rgba(96,165,250,0.12)",
                                        color: "#60a5fa",
                                        padding: "2px 8px",
                                        borderRadius: 6
                                      }}
                                    >
                                      {q}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {totalRules === 0 && (
                              <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                                No semantic terms configured for this topic.
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Interactive Profile Explorer Search Box Container */}
                      <div
                        style={{
                          borderTop: "1px solid var(--border)",
                          paddingTop: 18,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          position: "relative"
                        }}
                      >
                        <label
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--text-secondary)",
                            display: "flex",
                            alignItems: "center",
                            gap: 4
                          }}
                        >
                          Profile Explorer <span style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 500 }}>(Mock analysis view)</span>
                        </label>

                        <form
                          onSubmit={(e) => handleProfileSearchSubmit(e, topic.id, topic.name)}
                          style={{
                            display: "flex",
                            gap: 8,
                            position: "relative"
                          }}
                        >
                          <div style={{ position: "relative", flex: 1 }}>
                            <span
                              style={{
                                position: "absolute",
                                left: 10,
                                top: "50%",
                                transform: "translateY(-50%)",
                                fontSize: 13,
                                color: "var(--text-muted)",
                                userSelect: "none"
                              }}
                            >
                              @
                            </span>
                            <input
                              type="text"
                              value={searchVal}
                              onChange={(e) => {
                                const val = e.target.value;
                                setProfileInputs(prev => ({ ...prev, [topic.id]: val }));
                              }}
                              onFocus={() => {
                                setProfileFocus(prev => ({ ...prev, [topic.id]: true }));
                              }}
                              onBlur={() => {
                                // Delayed hide to let user click list items
                                setTimeout(() => {
                                  setProfileFocus(prev => ({ ...prev, [topic.id]: false }));
                                }, 200);
                              }}
                              placeholder="mohakmangal"
                              style={{
                                background: "var(--bg-subtle)",
                                border: "1px solid var(--border)",
                                color: "var(--text-primary)",
                                borderRadius: 8,
                                padding: "8px 8px 8px 24px",
                                fontSize: 13,
                                width: "100%",
                                outline: "none",
                                transition: "all 0.15s ease",
                                borderColor: inputFocused ? "var(--accent)" : "var(--border)",
                                boxShadow: inputFocused ? "0 0 0 2px rgba(168,85,247,0.15)" : "none"
                              }}
                            />

                            {/* Autocomplete dropdown */}
                            {inputFocused && searchVal.trim() && matchingProfiles.length > 0 && (
                              <div
                                style={{
                                  position: "absolute",
                                  bottom: "100%",
                                  left: 0,
                                  right: 0,
                                  background: "var(--bg-surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 8,
                                  boxShadow: "0 -8px 20px rgba(0,0,0,0.15)",
                                  zIndex: 10,
                                  marginBottom: 6,
                                  overflow: "hidden",
                                  animation: "fadeIn 0.15s ease"
                                }}
                              >
                                {matchingProfiles.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault(); // prevent input onBlur from firing immediately
                                      setProfileInputs(prev => ({ ...prev, [topic.id]: p.username }));
                                      // also optionally remove focus state if we want the dropdown to close immediately
                                      setProfileFocus(prev => ({ ...prev, [topic.id]: false }));
                                    }}
                                    style={{
                                      width: "100%",
                                      padding: "8px 12px",
                                      textAlign: "left",
                                      background: "transparent",
                                      border: "none",
                                      color: "var(--text-primary)",
                                      fontSize: 12,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      borderBottom: "1px solid var(--border)",
                                      transition: "background 0.15s ease"
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-hover)")}
                                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                                  >
                                    {p.profile_image_url ? (
                                      <img
                                        src={p.profile_image_url}
                                        alt={p.username}
                                        style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }}
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = "none";
                                        }}
                                      />
                                    ) : (
                                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--border)", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        {p.username[0]?.toUpperCase()}
                                      </div>
                                    )}
                                    <div style={{ display: "flex", flexDirection: "column" }}>
                                      <span style={{ fontWeight: 600 }}>@{p.username}</span>
                                      {p.display_name && (
                                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.display_name}</span>
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <button
                            type="submit"
                            disabled={submittingProfile[topic.id]}
                            style={{
                              background: submittingProfile[topic.id] ? "rgba(168,85,247,0.3)" : "var(--accent)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 8,
                              padding: "0 14px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: submittingProfile[topic.id] ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              transition: "all 0.15s ease",
                              boxShadow: submittingProfile[topic.id] ? "none" : "0 4px 10px rgba(168,85,247,0.15)"
                            }}
                            onMouseEnter={(e) => {
                              if (!submittingProfile[topic.id]) {
                                e.currentTarget.style.background = "#9333ea";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!submittingProfile[topic.id]) {
                                e.currentTarget.style.background = "var(--accent)";
                              }
                            }}
                          >
                            {submittingProfile[topic.id] ? (
                              <div
                                style={{
                                  width: 14,
                                  height: 14,
                                  borderRadius: "50%",
                                  border: "2px solid rgba(255,255,255,0.4)",
                                  borderTopColor: "#fff",
                                  animation: "spin 0.6s linear infinite"
                                }}
                              />
                            ) : (
                              <>
                                <span>Explore</span>
                                <ArrowRight size={13} />
                              </>
                            )}
                          </button>
                        </form>
                        
                        {analysisProgress[topic.id] && (
                          <div style={{
                            fontSize: 11,
                            color: "var(--accent)",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 4,
                            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
                          }}>
                            <RefreshCw size={12} className="spin-animation" />
                            {analysisProgress[topic.id]}
                          </div>
                        )}
                      </div>

                      {/* Inline Intelligence Dashboard */}
                      {activeProfiles[topic.id] && (
                        (() => {
                          const activeUsername = activeProfiles[topic.id];
                          const result = intelligenceResults[`${topic.id}-${activeUsername.toLowerCase()}`];
                          if (!result) return null;

                          const activeTab = tweetTabs[topic.id] || "supportive";
                          const sampleTweets = activeTab === "supportive" 
                            ? result.sample_supportive_tweets 
                            : result.sample_opposition_tweets;

                          return (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 16,
                                borderTop: "1px solid var(--border)",
                                paddingTop: 20,
                                animation: "fadeIn 0.3s ease",
                                position: "relative"
                              }}
                            >
                              {/* Dashboard Header */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                                    Intelligence Core: @{result.profile}
                                  </span>
                                  <span style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                                    <Calendar size={10} />
                                    Last analyzed: {new Date(result.analyzed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button
                                    type="button"
                                    onClick={() => handleRefreshIntelligence(topic.id, activeUsername)}
                                    title="Re-run Analysis"
                                    disabled={submittingProfile[topic.id]}
                                    style={{
                                      background: "var(--bg-subtle)",
                                      border: "1px solid var(--border)",
                                      color: "var(--text-secondary)",
                                      borderRadius: 6,
                                      padding: 5,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      transition: "all 0.15s ease"
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                                  >
                                    <RefreshCw size={13} className={submittingProfile[topic.id] ? "spin-animation" : ""} />
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
                                    style={{
                                      background: "var(--bg-subtle)",
                                      border: "1px solid var(--border)",
                                      color: "var(--text-secondary)",
                                      borderRadius: 6,
                                      padding: 5,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      transition: "all 0.15s ease"
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "#f87171"}
                                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              </div>

                              {/* Key Metrics / Gauge Bars */}
                              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {/* Relevance score */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600 }}>
                                    <span style={{ color: "var(--text-secondary)" }}>Topic Relevance</span>
                                    <span style={{ color: "#c084fc" }}>{(result.relevance_score * 100).toFixed(0)}%</span>
                                  </div>
                                  <div style={{ height: 6, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
                                    <div style={{ width: `${result.relevance_score * 100}%`, height: "100%", background: "linear-gradient(90deg, #a855f7, #3b82f6)", borderRadius: 3 }} />
                                  </div>
                                </div>

                                {/* Supportive / Opposition Stance */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600 }}>
                                      <span style={{ color: "var(--text-secondary)" }}>Supportive Stance</span>
                                      <span style={{ color: "#34d399" }}>{(result.supportive_score * 100).toFixed(0)}%</span>
                                    </div>
                                    <div style={{ height: 6, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
                                      <div style={{ width: `${result.supportive_score * 100}%`, height: "100%", background: "linear-gradient(90deg, #34d399, #059669)", borderRadius: 3 }} />
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600 }}>
                                      <span style={{ color: "var(--text-secondary)" }}>Opposition Stance</span>
                                      <span style={{ color: "#f87171" }}>{(result.opposition_score * 100).toFixed(0)}%</span>
                                    </div>
                                    <div style={{ height: 6, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
                                      <div style={{ width: `${result.opposition_score * 100}%`, height: "100%", background: "linear-gradient(90deg, #f87171, #ef4444)", borderRadius: 3 }} />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Sarcasm Confidence Warning */}
                              {result.sarcasm_confidence < 0.95 && (
                                <div style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "8px 12px",
                                  background: "rgba(245, 158, 11, 0.06)",
                                  border: "1px solid rgba(245, 158, 11, 0.15)",
                                  borderRadius: 8,
                                  color: "#fbbf24",
                                  fontSize: 11,
                                  lineHeight: 1.4
                                }}>
                                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                                  <span>
                                    Stance modulated by sarcasm cues (sarcasm confidence: {(result.sarcasm_confidence * 100).toFixed(0)}%). Lower confidence indicates high ambiguity.
                                  </span>
                                </div>
                              )}

                              {/* Tweet Coverage */}
                              <div style={{ display: "flex", flexDirection: "column", gap: 2, background: "rgba(255, 255, 255, 0.01)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" }}>
                                  <span>Topic Coverage</span>
                                  <span>{result.tweet_coverage_percent.toFixed(1)}%</span>
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                                  {result.matching_tweets_count} of {result.total_tweets_analyzed} tweets matched
                                </span>
                              </div>

                              {/* Strongest Matching Terms */}
                              {result.strongest_matching_terms && result.strongest_matching_terms.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                                    Strongest Matching Terms
                                  </span>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {result.strongest_matching_terms.map((term, idx) => {
                                      let bg = "rgba(168, 85, 247, 0.05)";
                                      let border = "1px solid rgba(168, 85, 247, 0.12)";
                                      let color = "var(--accent)";
                                      
                                      if (term.field_name === "negative_semantics") {
                                        bg = "rgba(239, 68, 68, 0.05)";
                                        border = "1px solid rgba(239, 68, 68, 0.12)";
                                        color = "#f87171";
                                      } else if (term.field_name.includes("sarcasm")) {
                                        bg = "rgba(245, 158, 11, 0.05)";
                                        border = "1px solid rgba(245, 158, 11, 0.12)";
                                        color = "#fbbf24";
                                      }

                                      return (
                                        <span
                                          key={idx}
                                          style={{
                                            fontSize: 10,
                                            background: bg,
                                            border: border,
                                            color: color,
                                            padding: "3px 8px",
                                            borderRadius: 6,
                                            fontWeight: 500,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 4
                                          }}
                                        >
                                          <span>{term.text}</span>
                                          <span style={{ opacity: 0.7, fontSize: 9 }}>{term.avg_similarity.toFixed(2)}</span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Sample Tweets Accordion Tabs */}
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <div style={{ display: "flex", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
                                  <button
                                    type="button"
                                    onClick={() => setTweetTabs(prev => ({ ...prev, [topic.id]: "supportive" }))}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      color: activeTab === "supportive" ? "var(--text-primary)" : "var(--text-muted)",
                                      fontWeight: 600,
                                      fontSize: 11,
                                      paddingBottom: 6,
                                      borderBottom: activeTab === "supportive" ? "2px solid #10b981" : "2px solid transparent",
                                      cursor: "pointer"
                                    }}
                                  >
                                    Supportive ({result.sample_supportive_tweets.length})
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTweetTabs(prev => ({ ...prev, [topic.id]: "opposition" }))}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      color: activeTab === "opposition" ? "var(--text-primary)" : "var(--text-muted)",
                                      fontWeight: 600,
                                      fontSize: 11,
                                      paddingBottom: 6,
                                      borderBottom: activeTab === "opposition" ? "2px solid #ef4444" : "2px solid transparent",
                                      cursor: "pointer"
                                    }}
                                  >
                                    Opposition ({result.sample_opposition_tweets.length})
                                  </button>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto", paddingRight: 4 }}>
                                  {sampleTweets.length === 0 ? (
                                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", padding: "10px 0" }}>
                                      No matching tweets detected for this category.
                                    </span>
                                  ) : (
                                    sampleTweets.map((tweet, idx) => (
                                      <div
                                        key={idx}
                                        style={{
                                          background: "rgba(255, 255, 255, 0.01)",
                                          border: "1px solid var(--border)",
                                          borderRadius: 8,
                                          padding: 10,
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: 6
                                        }}
                                      >
                                        <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                                          "{tweet.text}"
                                        </span>
                                        <div style={{ display: "flex", gap: 8, fontSize: 9, color: "var(--text-muted)" }}>
                                          <span style={{ color: activeTab === "supportive" ? "#34d399" : "#f87171" }}>
                                            Pos: {tweet.positive_signal.toFixed(2)}
                                          </span>
                                          <span>•</span>
                                          <span style={{ color: "#ef4444" }}>
                                            Neg: {tweet.negative_signal.toFixed(2)}
                                          </span>
                                          {tweet.sarcasm_signal > 0 && (
                                            <>
                                              <span>•</span>
                                              <span style={{ color: "#fbbf24" }}>
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

                              {/* Debug breakdown */}
                              <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
                                <button
                                  type="button"
                                  onClick={() => setShowDebug(prev => ({ ...prev, [topic.id]: !prev[topic.id] }))}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    background: "none",
                                    border: "none",
                                    color: "var(--text-muted)",
                                    fontSize: 10,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    padding: 0
                                  }}
                                >
                                  <Sliders size={11} />
                                  {showDebug[topic.id] ? "Hide raw signals breakdown" : "Show raw signals breakdown"}
                                </button>
                                {showDebug[topic.id] && (
                                  <pre style={{
                                    background: "rgba(0, 0, 0, 0.2)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 6,
                                    padding: 8,
                                    marginTop: 8,
                                    fontSize: 10,
                                    fontFamily: "monospace",
                                    color: "var(--text-secondary)",
                                    overflowX: "auto",
                                    whiteSpace: "pre-wrap"
                                  }}>
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
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
