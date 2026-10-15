"use client";

import { useState, useEffect } from "react";
import { Search, Activity, Clock, Database, Play, RefreshCw, AlignLeft, Layers, CheckCircle, XCircle, Compass, Download, Trash2, AlertTriangle, Sliders } from "lucide-react";
import { getAllProfilesForCompare, getEmbeddingRuns, getEmbeddingsCount } from "@/app/actions/compare";
import { fetchTopics } from "@/app/actions/topics";
import { ST_EMBEDDING_MODELS } from "@/config/models";

interface DbProfileShort {
  id: number;
  username: string;
  display_name: string | null;
  profile_image_url: string | null;
  followers_count: string;
  tweet_count: string;
}

interface EmbeddingRun {
  model_name: string;
  started_at: string;
  completed_at: string | null;
  tweets_processed: number;
  tweets_skipped: number;
  duration: number | null;
}

export default function CompareSTPage() {
  const [profiles, setProfiles] = useState<DbProfileShort[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<DbProfileShort | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [runs, setRuns] = useState<EmbeddingRun[]>([]);
  const [embeddingsCount, setEmbeddingsCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState<any[]>([]);


  const [generatingModels, setGeneratingModels] = useState<string[]>([]);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [forceRegenerate, setForceRegenerate] = useState(false);

  const [deletingModels, setDeletingModels] = useState<string[]>([]);

  useEffect(() => {
    let pollInterval: number | null = null;
    
    if (generatingModels.length > 0) {
      if (selectedProfile) {
        pollInterval = window.setInterval(async () => {
          try {
            const countData = await getEmbeddingsCount(selectedProfile.username);
            setEmbeddingsCount(countData);
          } catch (e) {}
        }, 2000);
      }
    }
    
    return () => {
      if (pollInterval) window.clearInterval(pollInterval);
    };
  }, [generatingModels, selectedProfile]);

  // Compare Search State
  const [compareQuery, setCompareQuery] = useState("");
  const [compareResults, setCompareResults] = useState<Record<string, any[]>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);
  const [selectedSearchModels, setSelectedSearchModels] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    Object.keys(ST_EMBEDDING_MODELS).forEach(modelId => {
      initial[modelId] = true;
    });
    return initial;
  });
  const [searchLimit, setSearchLimit] = useState(10);
  const [searchingModels, setSearchingModels] = useState<string[]>([]);
  // Full Topic intelligence UI states
  const [tiTweetTabs, setTiTweetTabs] = useState<Record<string, "supportive" | "opposition">>({});
  const [tiShowDebugInfo, setTiShowDebugInfo] = useState<Record<string, boolean>>({});

  const [paramsLoaded, setParamsLoaded] = useState(false);

  // Topic Intelligence state (separate section at bottom)
  const [tiProfile, setTiProfile] = useState<DbProfileShort | null>(null);
  const [tiProfileQuery, setTiProfileQuery] = useState("");
  const [tiProfileSuggestions, setTiProfileSuggestions] = useState(false);
  const [tiSelectedTopics, setTiSelectedTopics] = useState<Record<string, boolean>>({});
  const [tiSelectAll, setTiSelectAll] = useState(true);
  const [tiResults, setTiResults] = useState<Record<string, Record<string, any>>>({});
  const [tiRunning, setTiRunning] = useState<Record<string, Record<string, boolean>>>({});
  const [tiProgress, setTiProgress] = useState<Record<string, Record<string, string>>>({});

    const triggerNotification = (message: string, type: "success" | "info" | "error" = "info") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  useEffect(() => {
    async function loadTopics() {
      try {
        const data = await fetchTopics();
        setTopics(data || []);
      } catch (e) {}
    }
    loadTopics();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const data = await getAllProfilesForCompare();
        setProfiles(data as any[] || []);
      } catch (err) {
        console.error("Failed to load profiles", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // 1. Load URL query parameters on mount after profiles are available
  useEffect(() => {
    if (loading || profiles.length === 0 || paramsLoaded) return;

    const params = new URLSearchParams(window.location.search);
    const usernameParam = params.get("username");
    const queryParam = params.get("query");
    const limitParam = params.get("limit");
    const modelsParam = params.get("models");

    if (usernameParam) {
      const profileObj = profiles.find(p => p.username.toLowerCase() === usernameParam.toLowerCase());
      if (profileObj) {
        setSelectedProfile(profileObj);
        setSearchQuery(profileObj.username);
      }
    }

    if (queryParam) {
      setCompareQuery(queryParam);
    }

    if (limitParam) {
      const limitVal = parseInt(limitParam);
      if (!isNaN(limitVal)) {
        setSearchLimit(limitVal);
      }
    }

    const activeModels = Object.keys(ST_EMBEDDING_MODELS).filter(modelId => {
      if (!modelsParam) return true;
      const activeModelNames = modelsParam.split(",");
      const m = ST_EMBEDDING_MODELS[modelId];
      return activeModelNames.includes(m.displayName) || activeModelNames.includes(modelId);
    });

    if (modelsParam) {
      const newSelection: Record<string, boolean> = {};
      Object.keys(ST_EMBEDDING_MODELS).forEach(modelId => {
        newSelection[modelId] = activeModels.includes(modelId);
      });
      setSelectedSearchModels(newSelection);
    }

    setParamsLoaded(true);

    // Auto-trigger search if query & username exist in query parameters
    if (queryParam && usernameParam && activeModels.length > 0) {
      performSearch(usernameParam, queryParam, parseInt(limitParam || "10") || 10, activeModels);
    }
  }, [loading, profiles, paramsLoaded]);

  // 2. Sync active states to query parameters dynamically
  useEffect(() => {
    if (!paramsLoaded) return;

    const params = new URLSearchParams();
    if (selectedProfile) {
      params.set("username", selectedProfile.username);
    }
    if (compareQuery) {
      params.set("query", compareQuery);
    }
    if (searchLimit !== 10) {
      params.set("limit", searchLimit.toString());
    }

    const activeModelNames = Object.keys(ST_EMBEDDING_MODELS)
      .filter(modelId => selectedSearchModels[modelId])
      .map(modelId => ST_EMBEDDING_MODELS[modelId].displayName);

    if (activeModelNames.length < Object.keys(ST_EMBEDDING_MODELS).length) {
      params.set("models", activeModelNames.join(","));
    }

    const queryString = params.toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [selectedProfile, compareQuery, searchLimit, selectedSearchModels, paramsLoaded]);

  const refreshRuns = async (username: string) => {
    try {
      const data = await getEmbeddingRuns(username);
      setRuns(data);
      const countData = await getEmbeddingsCount(username);
      setEmbeddingsCount(countData);
    } catch (err) {
      console.error("Failed to load runs", err);
    }
  };

  useEffect(() => {
    if (selectedProfile) {
      refreshRuns(selectedProfile.username);
    }
  }, [selectedProfile]);

  const handleSelectProfile = (profile: DbProfileShort) => {
    setSelectedProfile(profile);
    setSearchQuery(profile.username);
    setShowSuggestions(false);
  };

  const filteredProfiles = profiles
    .filter(p => p.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.display_name && p.display_name.toLowerCase().includes(searchQuery.toLowerCase())))
    .slice(0, 8);

  const handleGenerate = async (modelId: string) => {
    if (!selectedProfile) return;
    setGeneratingModels(prev => [...prev, modelId]);
    try {
      const url = `${process.env.NEXT_PUBLIC_ML_API_URL || "http://127.0.0.1:8000"}/tweets/generate-model-embeddings`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: selectedProfile.username, model_name: modelId, force_regenerate: forceRegenerate }),
      });
      if (!response.ok) throw new Error(await response.text());

      await refreshRuns(selectedProfile.username);
      triggerNotification(`Generated embeddings for ${modelId}`, "success");
    } catch (err: any) {
      console.error(err);
      triggerNotification(err.message || "Failed to generate embeddings.", "error");
    } finally {
      setGeneratingModels(prev => prev.filter(m => m !== modelId));
    }
  };

  const handleDelete = async (modelId: string) => {
    if (!selectedProfile) return;
    if (!confirm(`Are you sure you want to delete all embeddings and runs for ${modelId}?`)) return;
    
    setDeletingModels(prev => [...prev, modelId]);
    try {
      const url = `${process.env.NEXT_PUBLIC_ML_API_URL || "http://127.0.0.1:8000"}/tweets/delete-model-embeddings`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: selectedProfile.username, model_name: modelId }),
      });
      if (!response.ok) throw new Error(await response.text());

      await refreshRuns(selectedProfile.username);
      triggerNotification(`Deleted embeddings for ${modelId}`, "success");
    } catch (err: any) {
      console.error(err);
      triggerNotification(err.message || "Failed to delete embeddings.", "error");
    } finally {
      setDeletingModels(prev => prev.filter(m => m !== modelId));
    }
  };

  const handleGenerateSequential = async () => {
    if (!selectedProfile) return;
    setIsGeneratingAll(true);
    const models = Object.keys(ST_EMBEDDING_MODELS).filter(id => !id.includes("__"));
    for (const modelId of models) {
      setGeneratingModels([modelId]);
      try {
        const url = `${process.env.NEXT_PUBLIC_ML_API_URL || "http://127.0.0.1:8000"}/tweets/generate-model-embeddings`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: selectedProfile.username, model_name: modelId, force_regenerate: forceRegenerate }),
        });
        if (!response.ok) throw new Error(await response.text());

        await refreshRuns(selectedProfile.username);
      } catch (err: any) {
        console.error(`Failed on ${modelId}:`, err);
        triggerNotification(`Failed generation for ${modelId}: ${err.message}`, "error");
        break; // stop sequential on failure
      }
    }
    setGeneratingModels([]);
    setIsGeneratingAll(false);
    triggerNotification("Completed multi-model generation.", "success");
  };

  const handleGenerateParallel = async () => {
    if (!selectedProfile) return;
    setIsGeneratingAll(true);
    const models = Object.keys(ST_EMBEDDING_MODELS).filter(id => !id.includes("__"));
    setGeneratingModels(models);

    try {
      await Promise.all(models.map(async (modelId) => {
        try {
          const url = `${process.env.NEXT_PUBLIC_ML_API_URL || "http://127.0.0.1:8000"}/tweets/generate-model-embeddings`;
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: selectedProfile.username, model_name: modelId, force_regenerate: forceRegenerate }),
          });
          if (!response.ok) throw new Error(await response.text());
        } catch (err: any) {
          console.error(`Failed on ${modelId}:`, err);
          triggerNotification(`Failed generation for ${modelId}: ${err.message}`, "error");
        }
      }));
      await refreshRuns(selectedProfile.username);
      triggerNotification("Completed parallel multi-model generation.", "success");
    } finally {
      setGeneratingModels([]);
      setIsGeneratingAll(false);
    }
  };

  const performSearch = async (username: string, query: string, limit: number, activeModels: string[]) => {
    setIsSearching(true);
    setSearchingModels(activeModels);
    setCompareResults({});

    const promises = activeModels.map(async (modelId) => {
      try {
        const url = `${process.env.NEXT_PUBLIC_ML_API_URL || "http://127.0.0.1:8000"}/tweets/search`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, query, limit, model_name: modelId })
        });
        if (!response.ok) throw new Error(await response.text());
        const res = await response.json();
        setCompareResults(prev => ({ ...prev, [modelId]: res.results || [] }));
      } catch (err) {
        console.error(`Search failed for ${modelId}`, err);
        setCompareResults(prev => ({ ...prev, [modelId]: [] }));
      } finally {
        setSearchingModels(prev => prev.filter(m => m !== modelId));
      }
    });

    await Promise.allSettled(promises);
    setIsSearching(false);
  };

  const handleCompareSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile || !compareQuery.trim()) return;

    const activeModels = Object.keys(ST_EMBEDDING_MODELS).filter(modelId => selectedSearchModels[modelId]);
    if (activeModels.length === 0) {
      triggerNotification("Please select at least one model to search.", "error");
      return;
    }

    await performSearch(selectedProfile.username, compareQuery, searchLimit, activeModels);
  };

  const downloadCsv = (modelId: string, modelName: string) => {
    const results = compareResults[modelId] || [];
    if (results.length === 0) return;
    
    const headers = ["Tweet ID", "Text", "Score %"];
    const rows = results.map(r => [
      r.tweet_id,
      `"${r.text.replace(/"/g, '""')}"`,
      (r.score * 100).toFixed(1)
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedProfile?.username}_${modelName.toLowerCase()}_search_results.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Build metrics view
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  const getMetrics = (modelId: string) => {
    // Correctly matching full model string or stripped version if backend strips
    const modelRuns = runs.filter(r => (r.model_name === modelId || r.model_name === modelId.split("/").pop()) && r.completed_at);
    if (modelRuns.length === 0) return null;
    
    // The first one is the latest since runs are ordered by started_at DESC from the API
    const latestRun = modelRuns[0];
    
    // Find a run that actually processed tweets to show meaningful throughput, fallback to latest
    const meaningfulRun = modelRuns.find(r => r.tweets_processed > 0) || latestRun;

    const throughput = meaningfulRun.duration && meaningfulRun.duration > 0 
      ? (meaningfulRun.tweets_processed / meaningfulRun.duration).toFixed(1) 
      : "0";
      
    return {
      time: meaningfulRun.duration ? formatTime(meaningfulRun.duration) : "0s",
      throughput: `${throughput} t/sec`,
      processed: latestRun.tweets_processed,
      skipped: latestRun.tweets_skipped
    };
  };

  return (
    <div className="w-full flex justify-center pt-20 pb-20 px-6 sm:pt-12 sm:pb-10 sm:px-4 bg-[var(--bg-base)] min-h-[calc(100vh-56px)] text-[var(--text-primary)] font-sans relative overflow-hidden">
      {notification && (
        <div className={`fixed bottom-6 right-6 z-[1000] backdrop-blur-md text-white py-3.5 px-5 rounded-xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3)] flex items-center gap-2.5 text-sm font-semibold max-w-[450px] border border-white/15 animate-[slideIn_0.3s_ease-out] ${notification.type === "success" ? "bg-emerald-500/95" : notification.type === "error" ? "bg-red-500/95" : "bg-[var(--accent)]"}`}>
          {notification.type === "success" ? <CheckCircle size={18} /> : notification.type === "error" ? <XCircle size={18} /> : <Compass size={18} />}
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="bg-transparent border-none text-white cursor-pointer ml-auto p-0 flex opacity-80 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      <div className="w-full max-w-[960px] mx-auto flex flex-col gap-9 page-container relative z-10">

        {/* Profile Search */}
        <div className="flex flex-wrap justify-between items-center gap-4 bg-white/5 border border-[var(--border)] rounded-xl py-4 px-5 backdrop-blur-md animate-[fadeIn_0.4s_ease-out]">
          <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Search Profile Target:</span>

          <div className="flex flex-col items-center w-full max-w-[400px] relative">
            <div className={`relative w-full transition-all duration-300 ${showSuggestions ? "z-50" : "z-10"}`}>
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
                <Search size={16} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Search for a profile to compare..."
                className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg py-2 pr-3 pl-9 text-sm w-full outline-none transition-colors duration-150 focus:border-[var(--accent)]"
              />
              {loading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                  <RefreshCw size={14} className="animate-spin" />
                </span>
              )}

              {/* Dropdown */}
              {showSuggestions && searchQuery && (
                <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-[0_8px_20px_rgba(0,0,0,0.15)] overflow-hidden animate-[fadeIn_0.15s_ease]">
                  {filteredProfiles.length === 0 ? (
                    <div className="p-3 text-xs text-[var(--text-muted)] text-center">No profiles found</div>
                  ) : (
                    filteredProfiles.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleSelectProfile(p)}
                        className="w-full py-2.5 px-4 text-left bg-transparent border-none border-b border-[var(--border)] text-[var(--text-primary)] text-sm cursor-pointer flex items-center gap-2.5 transition-colors duration-150 hover:bg-[var(--bg-hover)] last:border-0"
                      >
                        {p.profile_image_url ? (
                          <img src={p.profile_image_url} alt={p.username} className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-[var(--border)] flex items-center justify-center text-[10px] font-bold">
                            {p.username[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-semibold text-[13px]">@{p.username}</span>
                          {p.display_name && <span className="text-[10px] text-[var(--text-muted)]">{p.display_name}</span>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Click away overlay */}
            {showSuggestions && (
              <div className="fixed inset-0 z-40" onClick={() => setShowSuggestions(false)} />
            )}
          </div>
        </div>

        {selectedProfile && (
          <div className="flex flex-col gap-6 animate-[slideIn_0.3s_ease-out]">
            {/* Profile Overview Card */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-wrap items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.05)] gap-4">
              <div className="flex items-center gap-4">
                {selectedProfile.profile_image_url ? (
                  <img src={selectedProfile.profile_image_url} className="w-14 h-14 rounded-full border border-[var(--border)] object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[var(--border)] flex items-center justify-center text-lg font-bold text-[var(--text-secondary)]">
                    {selectedProfile.username[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-xl font-bold tracking-tight">@{selectedProfile.username}</span>
                  <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 mt-1 font-medium">
                    <Database size={12} /> Total Tweets Available: {selectedProfile.tweet_count || "0"}
                  </span>
                  <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 mt-2.5 cursor-pointer w-fit hover:text-[var(--text-primary)] transition-colors select-none">
                    <input 
                      type="checkbox" 
                      checked={forceRegenerate}
                      onChange={(e) => setForceRegenerate(e.target.checked)}
                      className="accent-[var(--accent)] rounded cursor-pointer w-3.5 h-3.5 border border-[var(--border)]"
                    />
                    Force fresh generation (overwrite existing embeddings)
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateSequential}
                  disabled={isGeneratingAll || generatingModels.length > 0}
                  className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 border ${isGeneratingAll || generatingModels.length > 0
                    ? "bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border)] cursor-not-allowed"
                    : "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--bg-hover)] shadow-sm"
                    }`}
                >
                  {isGeneratingAll && generatingModels.length <= 1 ? (
                    <><RefreshCw size={14} className="animate-spin text-[var(--accent)]" /> Generating...</>
                  ) : (
                    <><Layers size={14} /> Sequence All</>
                  )}
                </button>
                <button
                  onClick={handleGenerateParallel}
                  disabled={isGeneratingAll || generatingModels.length > 0}
                  className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-150 border ${isGeneratingAll || generatingModels.length > 0
                    ? "bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border)] cursor-not-allowed"
                    : "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--bg-hover)] shadow-sm"
                    }`}
                >
                  {isGeneratingAll && generatingModels.length > 1 ? (
                    <><RefreshCw size={14} className="animate-spin text-[var(--accent)]" /> Parallelizing...</>
                  ) : (
                    <><Play size={14} /> Parallel All</>
                  )}
                </button>
              </div>
            </div>

            {/* Models Grid */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
              {Object.values(ST_EMBEDDING_MODELS).filter(m => !m.id.includes("__")).map((model) => {
                const isGeneratingThis = generatingModels.includes(model.id);
                const metrics = getMetrics(model.id);

                const baseCount = embeddingsCount[model.id] || embeddingsCount[model.id.split("/").pop()!] || 0;

                return (
                  <article key={model.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)] hover:border-[var(--accent)]/30">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-muted)]">Model</span>
                        <span className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-secondary)]">
                          {model.dimension}d
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[var(--text-primary)] leading-tight mt-1">{model.displayName}</h3>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5 font-medium">
                        <Database size={11} /> 
                        {baseCount} embeddings stored
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGenerate(model.id)}
                        disabled={generatingModels.includes(model.id) || isGeneratingAll || deletingModels.includes(model.id)}
                        className={`flex-1 py-2 rounded-lg font-semibold text-[13px] flex items-center justify-center gap-1.5 transition-all duration-150 ${isGeneratingThis
                          ? "bg-purple-500/10 text-[var(--accent)] border border-[var(--accent)]/30"
                          : (generatingModels.length > 0 || isGeneratingAll || deletingModels.includes(model.id))
                            ? "bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-muted)] cursor-not-allowed"
                            : "bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer"
                          }`}
                      >
                        {isGeneratingThis ? (
                          <><RefreshCw size={13} className="animate-spin" /> Processing...</>
                        ) : (
                          <><Play size={13} /> Generate</>
                        )}
                      </button>

                      {baseCount > 0 && (
                        <button
                          onClick={() => handleDelete(model.id)}
                          disabled={generatingModels.includes(model.id) || isGeneratingAll || deletingModels.includes(model.id)}
                          className={`px-2.5 py-2 rounded-lg border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-all ${
                            (generatingModels.length > 0 || isGeneratingAll || deletingModels.includes(model.id))
                              ? "opacity-50 cursor-not-allowed"
                              : "cursor-pointer"
                          }`}
                          title="Delete Embeddings"
                        >
                          {deletingModels.includes(model.id) ? (
                            <RefreshCw size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      )}
                    </div>

                    {isGeneratingThis && (
                      <div className="flex flex-col gap-1.5 mt-1 animate-[fadeIn_0.2s_ease]">
                        <div className="flex justify-between items-center text-[10px] font-bold text-[var(--accent)]">
                          <span>Generating Embeddings...</span>
                          <span>
                            {selectedProfile?.tweet_count 
                              ? Math.min(100, Math.round((baseCount / Number(selectedProfile.tweet_count)) * 100))
                              : 0}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-purple-500/10 border border-[var(--border)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] transition-all duration-300 ease-out rounded-full"
                            style={{ 
                              width: `${selectedProfile?.tweet_count 
                                ? Math.min(100, Math.max(2, (baseCount / Number(selectedProfile.tweet_count)) * 100))
                                : 2}%` 
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="border-t border-[var(--border)] pt-3 flex flex-col gap-2.5 mt-auto">
                      <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                        <Activity size={10} />
                        Metrics
                      </div>

                      {metrics ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-center bg-[var(--bg-subtle)] px-2.5 py-1.5 rounded-lg border border-[var(--border)]">
                            <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1"><Clock size={10} /> Time</span>
                            <span className="text-[12px] font-bold text-[var(--text-primary)]">{metrics.time}</span>
                          </div>
                          <div className="flex justify-between items-center bg-[var(--bg-subtle)] px-2.5 py-1.5 rounded-lg border border-[var(--border)]">
                            <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1"><Activity size={10} /> Speed</span>
                            <span className="text-[12px] font-bold text-emerald-500">{metrics.throughput}</span>
                          </div>
                          <div className="flex justify-between items-center bg-[var(--bg-subtle)] px-2.5 py-1.5 rounded-lg border border-[var(--border)]">
                            <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1"><AlignLeft size={10} /> Data</span>
                            <span className="text-[12px] font-bold text-blue-500">{metrics.processed} ({metrics.skipped})</span>
                          </div>
                        </div>
                      ) : (
                        <div className="py-4 text-center text-[11px] text-[var(--text-muted)] italic flex flex-col items-center gap-1.5 bg-[var(--bg-subtle)] rounded-lg border border-[var(--border)] border-dashed">
                          <Database size={14} className="opacity-40" />
                          No runs recorded
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>


            {/* Compare Results Section */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 flex flex-col gap-6 shadow-[0_4px_20px_rgba(0,0,0,0.05)] mt-2">
              <div className="flex flex-col gap-1.5">
                <h2 className="text-xl font-bold m-0 text-[var(--text-primary)] flex items-center gap-2">
                  <Search className="text-[var(--accent)]" size={20} /> Semantic Retrieval Compare
                </h2>
                <p className="text-[13px] text-[var(--text-secondary)] m-0">
                  Enter a semantic search query. It will be vectorized using each respective model and run against its own embeddings to compare quality.
                </p>
              </div>

              {/* Model selection checkboxes */}
              <div className="flex flex-col gap-2.5">
                <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Select Models to Search:
                </span>
                <div className="flex flex-wrap gap-2.5">
                  {Object.values(ST_EMBEDDING_MODELS).map((model) => {
                    const isChecked = selectedSearchModels[model.id] || false;
                    return (
                      <label
                        key={model.id}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer select-none transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm ${
                          isChecked
                            ? "bg-purple-500/10 border-[var(--accent)] text-[var(--text-primary)]"
                            : "bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            setSelectedSearchModels(prev => ({
                              ...prev,
                              [model.id]: e.target.checked
                            }));
                          }}
                          className="accent-[var(--accent)] cursor-pointer w-4 h-4 rounded border-[var(--border)]"
                        />
                        <span className="tracking-tight">{model.displayName}</span>
                        <span className="text-[9px] opacity-50 font-mono font-medium">({model.dimension}d)</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleCompareSearch} className="flex flex-wrap gap-3 w-full max-w-[720px] relative items-center animate-[fadeIn_0.2s_ease]">
                <div className="relative flex-1 min-w-[280px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                    <Search size={16} />
                  </span>
                  <input
                    type="text"
                    value={compareQuery}
                    onChange={(e) => setCompareQuery(e.target.value)}
                    placeholder="Enter semantic query (e.g., 'artificial intelligence future')..."
                    className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg py-2.5 pr-3 pl-9 text-[13px] w-full outline-none transition-colors duration-150 focus:border-[var(--accent)]"
                  />
                </div>

                <div className="flex items-center gap-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] shadow-sm select-none">
                  <span className="text-[var(--text-secondary)] font-medium">Limit:</span>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={searchLimit}
                    onChange={(e) => setSearchLimit(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))}
                    className="bg-transparent border-none text-[var(--text-primary)] w-12 text-center outline-none font-bold text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSearching || !compareQuery.trim()}
                  className={`px-5 py-2.5 rounded-lg font-semibold text-[13px] transition-all duration-150 flex items-center gap-1.5 border ${isSearching || !compareQuery.trim()
                    ? "bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border)] cursor-not-allowed"
                    : "bg-[var(--accent)] text-white border-[var(--accent)] hover:bg-[#9333ea] cursor-pointer shadow-sm"
                    }`}
                >
                  {isSearching ? <><RefreshCw size={14} className="animate-spin" /> Searching...</> : "Compare Search"}
                </button>
              </form>

              {Object.keys(compareResults).length > 0 && Object.values(ST_EMBEDDING_MODELS).some(m => selectedSearchModels[m.id]) && (
                <div className={`grid ${
                  Object.values(ST_EMBEDDING_MODELS).filter(m => selectedSearchModels[m.id]).length === 1 
                    ? "grid-cols-1" 
                    : Object.values(ST_EMBEDDING_MODELS).filter(m => selectedSearchModels[m.id]).length === 2 
                      ? "grid-cols-1 md:grid-cols-2" 
                      : Object.values(ST_EMBEDDING_MODELS).filter(m => selectedSearchModels[m.id]).length === 3 
                        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" 
                        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
                } gap-5 pt-5 border-t border-[var(--border)]`}>
                  {Object.values(ST_EMBEDDING_MODELS)
                    .filter(model => selectedSearchModels[model.id])
                    .map((model) => {
                      const results = compareResults[model.id] || [];
                      return (
                        <div key={model.id} className="flex flex-col gap-3">
                          <div className="bg-[var(--bg-subtle)] p-2.5 rounded-lg border border-[var(--border)] text-center flex flex-col gap-0.5 relative group">
                            <span className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-widest">Results for</span>
                            <span className="text-[13px] font-bold text-[var(--text-primary)]">{model.displayName}</span>
                            {results.length > 0 && (
                              <button
                                onClick={() => downloadCsv(model.id, model.displayName)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer flex items-center justify-center shadow-sm"
                                title={`Download ${model.displayName} results as CSV`}
                              >
                                <Download size={12} />
                              </button>
                            )}
                          </div>

                          <div className="flex flex-col gap-2.5">
                            {searchingModels.includes(model.id) ? (
                              <div className="flex flex-col items-center justify-center py-10 bg-[var(--bg-subtle)] rounded-lg border border-[var(--border)] border-dashed gap-2.5 animate-[pulse_1.5s_infinite]">
                                <RefreshCw size={18} className="animate-spin text-[var(--accent)]" />
                                <span className="text-[11px] text-[var(--text-muted)] font-semibold">Searching embeddings...</span>
                              </div>
                            ) : results.length === 0 ? (
                              <div className="text-[11px] text-[var(--text-muted)] italic text-center p-3 bg-[var(--bg-subtle)] rounded-lg border border-[var(--border)] border-dashed">
                                No results found or embeddings not generated yet.
                              </div>
                            ) : (
                              results.map((r: any, idx: number) => (
                                <div key={idx} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg p-3 flex flex-col gap-2 hover:border-[var(--accent)]/50 transition-colors shadow-sm animate-[fadeIn_0.2s_ease]">
                                  <div className="flex justify-between items-start">
                                    <span className="text-[9px] font-mono text-[var(--text-muted)]">ID: {r.tweet_id}</span>
                                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                      {(r.score * 100).toFixed(1)}%
                                    </span>
                                  </div>
                                  <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed m-0 line-clamp-4">
                                    {r.text}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}


      {/* ── Topic Intelligence Section ── */}
      {selectedProfile && topics.length > 0 && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 flex flex-col gap-6 shadow-[0_4px_20px_rgba(0,0,0,0.05)] mt-2">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold m-0 text-[var(--text-primary)] flex items-center gap-2">
              <Compass className="text-[var(--accent)]" size={20} /> Topic Intelligence Compare
            </h2>
            <p className="text-[13px] text-[var(--text-secondary)] m-0">
              Run topic stance analysis against each ST model's embeddings separately to compare how model choice affects intelligence quality.
            </p>
          </div>

          {/* Topic filter */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Select Topics:</span>
            <div className="flex flex-wrap gap-2">
              <label className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer select-none transition-all ${tiSelectAll ? "bg-purple-500/10 border-[var(--accent)] text-[var(--text-primary)]" : "bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-muted)]"}`}>
                <input type="checkbox" checked={tiSelectAll} onChange={(e) => { setTiSelectAll(e.target.checked); if (e.target.checked) setTiSelectedTopics({}); }} className="accent-[var(--accent)] w-3.5 h-3.5 cursor-pointer" />
                All Topics
              </label>
              {topics.map(t => {
                const on = !tiSelectAll && !!tiSelectedTopics[t.id];
                return (
                  <label key={t.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer select-none transition-all ${on ? "bg-purple-500/10 border-[var(--accent)] text-[var(--text-primary)]" : "bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-muted)]"}`}>
                    <input type="checkbox" checked={on} onChange={(e) => { setTiSelectedTopics(prev => ({ ...prev, [t.id]: e.target.checked })); setTiSelectAll(false); }} className="accent-[var(--accent)] w-3.5 h-3.5 cursor-pointer" />
                    {t.name}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Topic cards */}
          {(tiSelectAll ? topics : topics.filter(t => tiSelectedTopics[t.id])).map(topic => {
            const modelIds = Object.keys(ST_EMBEDDING_MODELS);
            return (
              <div key={topic.id} className="border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-5 bg-[var(--bg-subtle)]">
                {/* Topic header + run button */}
                <div className="flex justify-between items-center">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[var(--accent)]">Topic</span>
                    <span className="text-base font-bold text-[var(--text-primary)]">{topic.name}</span>
                    {topic.semantic_queries?.length > 0 && (
                      <span className="text-[11px] text-[var(--text-muted)] line-clamp-1">{topic.semantic_queries.slice(0,3).join(" · ")}</span>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      if (!selectedProfile) return;
                      const profileId = selectedProfile.id;
                      for (const modelId of modelIds) {
                        setTiRunning(prev => ({ ...prev, [topic.id]: { ...(prev[topic.id] || {}), [modelId]: true } }));
                        setTiProgress(prev => ({ ...prev, [topic.id]: { ...(prev[topic.id] || {}), [modelId]: "Starting..." } }));
                        try {
                          const evtUrl = `/api/intelligence/stream?username=${encodeURIComponent(selectedProfile.username)}&topicId=${encodeURIComponent(topic.id)}&modelName=${encodeURIComponent(modelId)}`;
                          const es = new EventSource(evtUrl);
                          await new Promise<void>((resolve) => {
                            es.onmessage = (ev) => {
                              try {
                                const data = JSON.parse(ev.data);
                                if (data.status === "classifying") {
                                  setTiProgress(prev => ({ ...prev, [topic.id]: { ...(prev[topic.id] || {}), [modelId]: `Classifying ${data.current}/${data.total}...` } }));
                                } else if (data.status === "complete") {
                                  setTiResults(prev => ({ ...prev, [topic.id]: { ...(prev[topic.id] || {}), [modelId]: data.result } }));
                                  setTiProgress(prev => { const n = { ...prev }; delete n[topic.id]?.[modelId]; return n; });
                                  es.close(); resolve();
                                } else if (data.status === "error") {
                                  setTiProgress(prev => ({ ...prev, [topic.id]: { ...(prev[topic.id] || {}), [modelId]: "Error: " + data.message } }));
                                  es.close(); resolve();
                                } else {
                                  setTiProgress(prev => ({ ...prev, [topic.id]: { ...(prev[topic.id] || {}), [modelId]: data.status } }));
                                }
                              } catch {}
                            };
                            es.onerror = () => { es.close(); resolve(); };
                          });
                        } catch {}
                        setTiRunning(prev => ({ ...prev, [topic.id]: { ...(prev[topic.id] || {}), [modelId]: false } }));
                      }
                    }}
                    disabled={modelIds.some(m => tiRunning[topic.id]?.[m])}
                    className={`px-4 py-2 rounded-lg text-[13px] font-semibold border transition-all flex items-center gap-2 ${modelIds.some(m => tiRunning[topic.id]?.[m]) ? "bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-muted)] cursor-not-allowed" : "bg-[var(--accent)] text-white border-[var(--accent)] hover:bg-[#9333ea] cursor-pointer"}`}
                  >
                    {modelIds.some(m => tiRunning[topic.id]?.[m]) ? <><RefreshCw size={13} className="animate-spin" /> Running...</> : <><Play size={13} /> Run All 4 Models</>}
                  </button>
                </div>

                {/* 4-column results grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {modelIds.map(modelId => {
                    const model = ST_EMBEDDING_MODELS[modelId];
                    const result = tiResults[topic.id]?.[modelId];
                    const running = tiRunning[topic.id]?.[modelId];
                    const progress = tiProgress[topic.id]?.[modelId];
                    return (
                      <div key={modelId} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase font-bold tracking-widest text-[var(--text-muted)]">Model</span>
                          <span className="text-[13px] font-bold text-[var(--text-primary)] leading-tight">{model?.displayName}</span>
                        </div>

                        {running && (
                          <div className="text-[11px] text-[var(--accent)] font-semibold flex items-center gap-1.5 animate-pulse">
                            <RefreshCw size={11} className="animate-spin" />{progress || "Running..."}
                          </div>
                        )}

                        {!running && !result && (
                          <div className="py-6 text-center text-[11px] text-[var(--text-muted)] italic bg-[var(--bg-subtle)] rounded-lg border border-[var(--border)] border-dashed">
                            No analysis yet
                          </div>
                        )}

                        {result && !running && (() => {
                          const tabKey = `${topic.id}-${modelId}`;
                          const currentActiveTab = tiTweetTabs[tabKey] || "supportive";
                          const sampleTweets = currentActiveTab === "supportive"
                            ? result.sample_supportive_tweets || []
                            : result.sample_opposition_tweets || [];
                          const showDebug = !!tiShowDebugInfo[tabKey];

                          return (
                            <div className="flex flex-col gap-3">
                              {/* Relevance */}
                              <div className="flex flex-col gap-1">
                                <div className="flex justify-between text-[10px] font-semibold">
                                  <span className="text-[var(--text-secondary)]">Relevance</span>
                                  <span className="text-purple-400">{(result.relevance_score * 100).toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full" style={{ width: `${result.relevance_score * 100}%` }} />
                                </div>
                              </div>

                              {/* Supportive & Opposition */}
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <div className="flex justify-between text-[9px] font-semibold">
                                    <span className="text-[var(--text-secondary)]">Supportive</span>
                                    <span className="text-emerald-400">{(result.supportive_score * 100).toFixed(0)}%</span>
                                  </div>
                                  <div className="h-1 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style={{ width: `${result.supportive_score * 100}%` }} />
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <div className="flex justify-between text-[9px] font-semibold">
                                    <span className="text-[var(--text-secondary)]">Opposition</span>
                                    <span className="text-red-400">{(result.opposition_score * 100).toFixed(0)}%</span>
                                  </div>
                                  <div className="h-1 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full" style={{ width: `${result.opposition_score * 100}%` }} />
                                  </div>
                                </div>
                              </div>

                              {/* Sarcasm alerts */}
                              {result.sarcasm_confidence < 0.95 && (
                                <div className="flex items-start gap-1.5 p-2 bg-amber-500/5 border border-amber-500/15 rounded-lg text-amber-400 text-[10px] leading-tight">
                                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                  <span>
                                    Sarcasm confidence: {(result.sarcasm_confidence * 100).toFixed(0)}%
                                  </span>
                                </div>
                              )}

                              {/* Topic Coverage */}
                              <div className="flex flex-col gap-0.5 bg-white/5 border border-[var(--border)] rounded-lg p-2 text-[10px]">
                                <div className="flex justify-between font-semibold text-[var(--text-muted)]">
                                  <span>Coverage</span>
                                  <span>{result.tweet_coverage_percent?.toFixed(1)}%</span>
                                </div>
                                <span className="font-bold text-[var(--text-secondary)]">
                                  {result.matching_tweets_count} of {result.total_tweets_analyzed} matched
                                </span>
                              </div>

                              {/* Strongest Matching Terms */}
                              {result.strongest_matching_terms && result.strongest_matching_terms.length > 0 && (
                                <div className="flex flex-col gap-1">
                                  <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                                    Matching Terms
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    {result.strongest_matching_terms.slice(0, 5).map((term: any, idx: number) => {
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
                                          className={`text-[9px] py-0.5 px-1.5 rounded font-medium flex items-center gap-1 ${bg} ${border} ${color}`}
                                        >
                                          <span>{term.text}</span>
                                          <span className="opacity-70 text-[8px]">{term.avg_similarity.toFixed(2)}</span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Supportive & Opposition Tweet tabs */}
                              <div className="flex flex-col gap-1.5">
                                <div className="flex gap-2.5 border-b border-[var(--border)] pb-1">
                                  <button
                                    type="button"
                                    onClick={() => setTiTweetTabs(prev => ({ ...prev, [tabKey]: "supportive" }))}
                                    className={`bg-transparent border-none font-semibold text-[10px] pb-1 cursor-pointer ${currentActiveTab === "supportive"
                                        ? "text-[var(--text-primary)] border-b border-emerald-500"
                                        : "text-[var(--text-muted)] border-b border-transparent"
                                      }`}
                                  >
                                    Supportive ({result.sample_supportive_tweets?.length || 0})
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTiTweetTabs(prev => ({ ...prev, [tabKey]: "opposition" }))}
                                    className={`bg-transparent border-none font-semibold text-[10px] pb-1 cursor-pointer ${currentActiveTab === "opposition"
                                        ? "text-[var(--text-primary)] border-b border-red-500"
                                        : "text-[var(--text-muted)] border-b border-transparent"
                                      }`}
                                  >
                                    Opposition ({result.sample_opposition_tweets?.length || 0})
                                  </button>
                                </div>

                                <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-0.5">
                                  {sampleTweets.length === 0 ? (
                                    <span className="text-[10px] text-[var(--text-muted)] italic py-1">
                                      No matching tweets.
                                    </span>
                                  ) : (
                                    sampleTweets.map((tweet: any, idx: number) => (
                                      <div
                                        key={idx}
                                        className="bg-white/5 border border-[var(--border)] rounded-md p-1.5 flex flex-col gap-1"
                                      >
                                        <span className="text-[11px] text-[var(--text-secondary)] leading-snug">
                                          "{tweet.text}"
                                        </span>
                                        <div className="flex gap-1.5 text-[8px] text-[var(--text-muted)]">
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
                                                Sar: {tweet.sarcasm_signal.toFixed(2)}
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
                              <div className="border-t border-dashed border-[var(--border)] pt-1.5">
                                <button
                                  type="button"
                                  onClick={() => setTiShowDebugInfo(prev => ({ ...prev, [tabKey]: !prev[tabKey] }))}
                                  className="flex items-center gap-1 bg-transparent border-none text-[var(--text-muted)] text-[9px] font-semibold cursor-pointer p-0"
                                >
                                  <Sliders size={9} />
                                  {showDebug ? "Hide signals" : "Show signals"}
                                </button>
                                {showDebug && (
                                  <pre className="bg-black/20 border border-[var(--border)] rounded p-1 mt-1 text-[9px] font-mono text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(result.debug_signals, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(15px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
