"use client";

import { useState, useEffect, FormEvent, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  Clock,
  DownloadCloud,
  ExternalLink,
  Hash,
  Heart,
  Loader2,
  MessageSquare,
  Repeat2,
  Search,
  StopCircle,
  Eye,
  CheckCircle2,
  BarChart3,
  Database,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";

interface KeywordTweet {
  id: string;
  raw_text: string;
  clean_text: string | null;
  created_at: string;
  likes_count: string;
  retweets_count: string;
  replies_count: string;
  views_count: string | null;
  is_retweet: boolean;
  hashtags: string[];
  mentions: string[];
  urls: string[];
  username: string;
  display_name: string | null;
  profile_image_url: string | null;
}

interface SavedKeywordResult {
  keyword: string;
  stats: {
    total_tweets: number;
    unique_profiles: number;
    total_likes: number;
    total_retweets: number;
    total_replies: number;
    avg_engagement: number;
    first_seen: string | null;
    last_seen: string | null;
  };
  topHashtags: Array<{ hashtag: string; count: number }>;
  topProfiles: Array<{
    username: string;
    display_name: string | null;
    profile_image_url: string | null;
    tweet_count: number;
  }>;
  tweets: KeywordTweet[];
  total: number;
  page: number;
  limit: number;
  timeline: Array<{
    period: string;
    tweet_count: number;
    likes: number;
    retweets: number;
    replies: number;
  }>;
  topMentions: Array<{ mention: string; count: number }>;
}

interface KeywordJobStatus {
  jobId: string;
  keyword: string;
  status: "running" | "stopped" | "completed" | "error";
  fetchedCount: number;
  targetCount: number;
  message: string;
  error?: string;
  tweets?: Array<{
    id: string;
    url?: string;
    avatar?: string;
    fullname?: string;
    username?: string;
    date?: string;
    content: string;
    isRetweet?: boolean;
    stats?: {
      comments?: string;
      retweets?: string;
      hearts?: string;
      views?: string;
    };
  }>;
}

function formatNumber(value: string | number | null | undefined): string {
  return Number(value || 0).toLocaleString();
}

function formatDate(value: string | null): string {
  if (!value) return "N/A";
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function CustomSelect({
  value,
  onChange,
  options,
  customLabel = "Custom...",
  disabled = false,
  units,
  defaultUnit = "days",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  customLabel?: string;
  disabled?: boolean;
  units?: string[];
  defaultUnit?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [unit, setUnit] = useState<string>(() => {
    if (units && units.length > 0) {
      const num = Number(value);
      if (!isNaN(num) && num < 1 && units.includes("hrs")) return "hrs";
      return units[0];
    }
    return defaultUnit;
  });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedOption = options.find((o) => o.value === value);

  let displayCustomNumber = value;
  if (units && unit === "hrs") {
    const n = Number(value);
    if (!isNaN(n)) {
      displayCustomNumber = (n * 24).toString();
      if (displayCustomNumber.includes(".")) {
        displayCustomNumber = Number((n * 24).toFixed(2)).toString();
      }
    }
  }

  const handleInputChange = (rawVal: string) => {
    if (!rawVal) {
      onChange("");
      return;
    }
    const num = Number(rawVal);
    if (isNaN(num)) {
      onChange(rawVal);
      return;
    }
    if (units && unit === "hrs") {
      onChange((num / 24).toString());
    } else {
      onChange(rawVal);
    }
  };

  const handleUnitToggle = () => {
    if (!units || units.length <= 1) return;
    const currentIndex = units.indexOf(unit);
    const nextUnit = units[(currentIndex + 1) % units.length];
    setUnit(nextUnit);

    const currentNum = Number(displayCustomNumber);
    if (!isNaN(currentNum) && currentNum > 0) {
      if (nextUnit === "hrs") {
        onChange((currentNum / 24).toString());
      } else {
        onChange(currentNum.toString());
      }
    }
  };

  const showCustomMode = isCustom || !selectedOption;

  return (
    <div className="relative" ref={containerRef}>
      {!showCustomMode ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 bg-transparent text-[13px] font-semibold text-[var(--text-primary)] outline-none hover:text-[var(--accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {selectedOption.label}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 border-b border-[var(--accent)] pb-0.5">
            <input
              type="number"
              step="any"
              value={displayCustomNumber}
              onChange={(e) => handleInputChange(e.target.value)}
              disabled={disabled}
              autoFocus
              className="bg-transparent text-[13px] font-semibold text-[var(--text-primary)] outline-none w-[45px] text-center disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {units && units.length > 1 ? (
              <button
                type="button"
                onClick={handleUnitToggle}
                className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/30 transition-colors uppercase cursor-pointer"
                title="Click to toggle unit (hrs / days)"
              >
                {unit}
              </button>
            ) : (
              units && units[0] && (
                <span className="text-[12px] text-[var(--text-secondary)] whitespace-nowrap pr-1">
                  {units[0]}
                </span>
              )
            )}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(!isOpen)}
            className="disabled:opacity-50 text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
      )}

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 min-w-[140px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-lg z-50 overflow-hidden py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`w-full text-left px-4 py-2 text-[13px] transition-colors ${
                value === opt.value && !isCustom
                  ? "bg-[var(--accent)]/10 text-[var(--accent)] font-bold"
                  : "text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--accent)]"
              }`}
              onClick={() => {
                onChange(opt.value);
                setIsCustom(false);
                setIsOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            className="w-full text-left px-4 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--accent)] transition-colors border-t border-[var(--border)] mt-1"
            onClick={() => {
              setIsCustom(true);
              setIsOpen(false);
            }}
          >
            {customLabel}
          </button>
        </div>
      )}
    </div>
  );
}

const timeFrameOptions = [
  { label: "3 hrs", value: "0.125" },
  { label: "6 hrs", value: "0.25" },
  { label: "12 hrs", value: "0.5" },
  { label: "24 hrs", value: "1" },
  { label: "3 Days", value: "3" },
  { label: "7 Days", value: "7" },
  { label: "30 Days", value: "30" },
];

const tweetLimitOptions = [
  { label: "30 results", value: "30" },
  { label: "50 results", value: "50" },
  { label: "100 results", value: "100" },
  { label: "250 results", value: "250" },
  { label: "500 results", value: "500" },
];

export default function KeywordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      }
    >
      <KeywordExplorerContent />
    </Suspense>
  );
}

function KeywordExplorerContent() {
  const searchParams = useSearchParams();
  const initialKeyword = searchParams.get("q") || searchParams.get("keyword") || "";

  const [searchInput, setSearchInput] = useState(initialKeyword);
  const [activeKeyword, setActiveKeyword] = useState(initialKeyword);

  // Preloaded Database Data State
  const [savedData, setSavedData] = useState<SavedKeywordResult | null>(null);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"saved" | "live">("saved");

  // Scraping Controls
  const [daysLimit, setDaysLimit] = useState("0.5");
  const [maxResults, setMaxResults] = useState("30");
  const [saveToDb, setSaveToDb] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<KeywordJobStatus | null>(null);
  const [nitterError, setNitterError] = useState<string | null>(null);

  // Fetch saved database data for a keyword
  const fetchSavedData = useCallback(async (kw: string) => {
    if (!kw.trim()) {
      setSavedData(null);
      return;
    }
    setSavedLoading(true);
    setSavedError(null);
    try {
      const res = await fetch(`/api/analyse/keyword?q=${encodeURIComponent(kw.trim())}&limit=50&mode=db`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to load saved database data");
      }
      const data: SavedKeywordResult = await res.json();
      setSavedData(data);
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : "Failed to load saved data");
    } finally {
      setSavedLoading(false);
    }
  }, []);

  // Preload saved data when initial keyword or active keyword changes
  useEffect(() => {
    if (initialKeyword) {
      setActiveKeyword(initialKeyword);
      setSearchInput(initialKeyword);
      fetchSavedData(initialKeyword);
    }
  }, [initialKeyword, fetchSavedData]);

  // Poll job status
  useEffect(() => {
    if (!activeJobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/analyse/keyword-nitter?jobId=${encodeURIComponent(activeJobId)}`);
        if (res.ok) {
          const status = (await res.json()) as KeywordJobStatus;
          setJobStatus(status);

          if (status.status !== "running") {
            if (status.status === "completed") {
              // Automatically refresh saved DB data when scraping completes
              if (activeKeyword) fetchSavedData(activeKeyword);
            } else if (status.status === "error" && status.error) {
              setNitterError(status.error);
            }
            clearInterval(interval);
            setActiveJobId(null);
          }
        }
      } catch (e) {
        // ignore
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeJobId, activeKeyword, fetchSavedData]);

  const handleLoadSavedData = async (kwToLoad?: string) => {
    const trimmed = (kwToLoad !== undefined ? kwToLoad : searchInput).trim() || activeKeyword.trim();
    if (!trimmed) {
      setNitterError("Enter a keyword or hashtag to load saved data.");
      return;
    }
    setNitterError(null);
    setActiveKeyword(trimmed);
    setSearchInput(trimmed);
    setActiveTab("saved");
    await fetchSavedData(trimmed);
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleLoadSavedData();
  };

  const handleStartNitterScraping = async () => {
    const trimmed = searchInput.trim() || activeKeyword.trim();
    if (!trimmed) {
      setNitterError("Enter a keyword or hashtag before starting Nitter search.");
      return;
    }

    setNitterError(null);
    setActiveKeyword(trimmed);
    setSearchInput(trimmed);
    setActiveTab("live");

    try {
      const res = await fetch("/api/analyse/keyword-nitter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          keyword: trimmed,
          daysLimit: (!daysLimit || Number(daysLimit) <= 0) ? undefined : Number(daysLimit),
          maxResults: Number(maxResults),
          saveToDb,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to start Nitter search");
      }

      const payload = await res.json();
      setActiveJobId(payload.jobId);
      setJobStatus({
        jobId: payload.jobId,
        keyword: trimmed,
        status: "running",
        fetchedCount: 0,
        targetCount: Number(maxResults),
        message: `Connecting to Nitter to search "${trimmed}"...`,
      });
    } catch (err) {
      setNitterError(err instanceof Error ? err.message : "Failed to start Nitter search");
    }
  };

  const handleStopNitterScraping = async () => {
    if (!activeJobId) return;
    try {
      await fetch("/api/analyse/keyword-nitter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", jobId: activeJobId }),
      });
    } catch (e) {
      // ignore
    }
  };

  return (
    <main className="flex-1 w-full max-w-[1200px] mx-auto px-6 py-8 flex flex-col gap-8">
      {/* Hero Control Panel */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <DownloadCloud className="w-5 h-5 text-[var(--accent)]" />
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                Keyword Explorer
              </h1>
            </div>
            <p className="text-[13px] text-[var(--text-secondary)]">
              Stream live mentions of any keyword or hashtag directly from Nitter into your analytics database.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 focus-within:border-[var(--accent)] transition-all">
              <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span className="text-[12px] font-medium text-[var(--text-secondary)] whitespace-nowrap pr-1">Time Frame:</span>
              <CustomSelect
                value={daysLimit}
                onChange={setDaysLimit}
                options={timeFrameOptions}
                disabled={!!activeJobId}
                units={["hrs", "days"]}
              />
            </div>

            <div className="flex items-center gap-1.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 focus-within:border-[var(--accent)] transition-all">
              <span className="text-[12px] font-medium text-[var(--text-secondary)] whitespace-nowrap pr-1">Max Tweets:</span>
              <CustomSelect
                value={maxResults}
                onChange={setMaxResults}
                options={tweetLimitOptions}
                disabled={!!activeJobId}
                units={["tweets"]}
              />
            </div>

            <label className="flex items-center gap-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 cursor-pointer hover:border-[var(--accent)] transition-all select-none">
              <input
                type="checkbox"
                checked={saveToDb}
                onChange={(e) => setSaveToDb(e.target.checked)}
                disabled={!!activeJobId}
                className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
              />
              <span className="text-[12px] font-semibold text-[var(--text-primary)] whitespace-nowrap">
                Save to DB
              </span>
            </label>
          </div>
        </div>

        {/* Search Bar & Action Buttons */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Enter keyword, topic, or hashtag (e.g. #AI, crypto, technology)..."
              className="w-full pl-10 pr-4 py-3 text-[14px] bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-all"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={() => handleLoadSavedData()}
              disabled={savedLoading}
              className="flex-1 sm:flex-initial py-3 px-5 text-[14px] font-semibold border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] rounded-xl hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Database className={`w-4 h-4 ${savedLoading ? "animate-spin" : ""}`} />
              Load Saved Data
            </button>

            {!activeJobId ? (
              <button
                type="button"
                onClick={handleStartNitterScraping}
                className="flex-1 sm:flex-initial py-3 px-5 text-[14px] font-semibold bg-[var(--accent)] text-white rounded-xl hover:opacity-90 transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 shadow-sm"
              >
                <DownloadCloud className="w-4 h-4" />
                Fetch Nitter Keyword
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopNitterScraping}
                className="flex-1 sm:flex-initial py-3 px-5 text-[14px] font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 shadow-sm animate-pulse"
              >
                <StopCircle className="w-4 h-4" />
                Stop Scraping
              </button>
            )}

            {activeKeyword && (
              <button
                type="button"
                onClick={() => window.open(`/analyse-keyword?q=${encodeURIComponent(activeKeyword)}`, "_blank")}
                className="flex-1 sm:flex-initial py-3 px-5 text-[14px] font-semibold border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-xl hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
              >
                <BarChart3 className="w-4 h-4" />
                Analyse Keyword
              </button>
            )}
          </div>
        </form>

        {nitterError && (
          <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/30 text-red-500 p-3.5 rounded-xl text-[13px]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{nitterError}</span>
          </div>
        )}

        {/* Live Job Progress Banner */}
        {jobStatus && (
          <div className="flex flex-col gap-2.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                {jobStatus.status === "running" ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                ) : jobStatus.status === "completed" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <StopCircle className="w-4 h-4 text-amber-500" />
                )}
                {jobStatus.message}
              </span>
              <span className="font-bold text-[var(--accent)]">
                {formatNumber(jobStatus.fetchedCount)} / {formatNumber(jobStatus.targetCount)} results
              </span>
            </div>

            <div className="w-full h-2 bg-[var(--border)]/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.round((jobStatus.fetchedCount / Math.max(1, jobStatus.targetCount)) * 100))}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs Header & Tweets Display Section */}
      {(savedData || jobStatus?.tweets || savedLoading || activeKeyword) && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("saved")}
                className={`py-2.5 px-4 rounded-xl text-[14px] font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "saved"
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]"
                }`}
              >
                <Database className="w-4 h-4" />
                Saved DB Data
                {savedData && (
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    activeTab === "saved" ? "bg-white/20 text-white" : "bg-[var(--accent)]/15 text-[var(--accent)]"
                  }`}>
                    {formatNumber(savedData.total)}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("live")}
                className={`py-2.5 px-4 rounded-xl text-[14px] font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === "live"
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]"
                }`}
              >
                <DownloadCloud className="w-4 h-4" />
                Live Nitter Search
                {jobStatus?.tweets && (
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    activeTab === "live" ? "bg-white/20 text-white" : "bg-[var(--accent)]/15 text-[var(--accent)]"
                  }`}>
                    {formatNumber(jobStatus.tweets.length)}
                  </span>
                )}
                {jobStatus?.status === "running" && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </button>
            </div>

            {activeKeyword && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchSavedData(activeKeyword)}
                  disabled={savedLoading}
                  className="py-2 px-3 text-[13px] font-medium border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title="Reload saved database data"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${savedLoading ? "animate-spin" : ""}`} />
                  Refresh DB
                </button>
                <button
                  type="button"
                  onClick={() => window.open(`/analyse-keyword?q=${encodeURIComponent(activeKeyword)}`, "_blank")}
                  className="py-2 px-3 text-[13px] font-semibold border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Analyze in Topics
                </button>
              </div>
            )}
          </div>

          {/* TAB 1: Saved Database Tweets */}
          {activeTab === "saved" && (
            <div className="flex flex-col gap-6">
              {savedLoading ? (
                <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
                  <p className="text-[14px] font-medium text-[var(--text-secondary)]">
                    Preloading saved database tweets for &quot;{activeKeyword}&quot;...
                  </p>
                </div>
              ) : savedError ? (
                <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-4 rounded-xl text-[13px] flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{savedError}</span>
                </div>
              ) : savedData ? (
                <div className="flex flex-col gap-6">
                  {/* Saved Stats Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-1">
                      <span className="text-[12px] text-[var(--text-muted)] font-medium">Total DB Tweets</span>
                      <span className="text-xl font-bold text-[var(--text-primary)]">
                        {formatNumber(savedData.stats.total_tweets)}
                      </span>
                    </div>
                    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-1">
                      <span className="text-[12px] text-[var(--text-muted)] font-medium">Unique Authors</span>
                      <span className="text-xl font-bold text-[var(--text-primary)]">
                        {formatNumber(savedData.stats.unique_profiles)}
                      </span>
                    </div>
                    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-1">
                      <span className="text-[12px] text-[var(--text-muted)] font-medium">Total Likes</span>
                      <span className="text-xl font-bold text-[var(--text-primary)]">
                        {formatNumber(savedData.stats.total_likes)}
                      </span>
                    </div>
                    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-1">
                      <span className="text-[12px] text-[var(--text-muted)] font-medium">Total Retweets</span>
                      <span className="text-xl font-bold text-[var(--text-primary)]">
                        {formatNumber(savedData.stats.total_retweets)}
                      </span>
                    </div>
                  </div>

                  {/* Saved Tweets Feed */}
                  {savedData.tweets && savedData.tweets.length > 0 ? (
                    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-6">
                      <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                        <div className="flex flex-col gap-0.5">
                          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">
                            Preloaded Database Tweets ({savedData.tweets.length} shown of {formatNumber(savedData.total)})
                          </h2>
                          <p className="text-[13px] text-[var(--text-secondary)]">
                            Historical mentions saved in database for &quot;{savedData.keyword}&quot;
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-4">
                        {savedData.tweets.map((t, idx) => (
                          <article
                            key={`db-tweet-${t.id || idx}`}
                            className="p-5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] flex flex-col gap-3.5 hover:border-[var(--accent)]/50 transition-all shadow-sm"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center text-[13px] font-bold uppercase overflow-hidden shrink-0">
                                  {t.profile_image_url ? (
                                    <img
                                      src={t.profile_image_url}
                                      alt={t.username || "user"}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    (t.username || "??").slice(0, 2)
                                  )}
                                </div>
                                <div className="flex flex-col">
                                  {t.username ? (
                                    <Link
                                      href={`/profile?username=${t.username}`}
                                      className="text-[14px] font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] no-underline"
                                    >
                                      {t.display_name || `@${t.username}`}
                                    </Link>
                                  ) : (
                                    <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                                      {t.display_name || "Unknown User"}
                                    </span>
                                  )}
                                  <span className="text-[12px] text-[var(--text-secondary)]">
                                    {t.username ? `@${t.username} • ` : ""}{formatDate(t.created_at || null)}
                                  </span>
                                </div>
                              </div>

                              {t.is_retweet && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20">
                                  <Repeat2 className="w-3 h-3" /> RT
                                </span>
                              )}
                            </div>

                            <p className="text-[14px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
                              {t.clean_text || t.raw_text}
                            </p>

                            {/* Hashtags */}
                            {t.hashtags && t.hashtags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {t.hashtags.map((h, hIdx) => (
                                  <span
                                    key={hIdx}
                                    className="text-[12px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
                                    onClick={() => handleLoadSavedData(h.startsWith("#") ? h : `#${h}`)}
                                  >
                                    {h.startsWith("#") ? h : `#${h}`}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-6 pt-3 border-t border-[var(--border)]/60 text-[12px] text-[var(--text-muted)]">
                              <span className="flex items-center gap-1.5 hover:text-[var(--text-secondary)] transition-colors">
                                <Heart className="w-4 h-4" />
                                {formatNumber(t.likes_count)}
                              </span>
                              <span className="flex items-center gap-1.5 hover:text-[var(--text-secondary)] transition-colors">
                                <Repeat2 className="w-4 h-4" />
                                {formatNumber(t.retweets_count)}
                              </span>
                              <span className="flex items-center gap-1.5 hover:text-[var(--text-secondary)] transition-colors">
                                <MessageSquare className="w-4 h-4" />
                                {formatNumber(t.replies_count)}
                              </span>
                              {t.views_count && (
                                <span className="flex items-center gap-1.5 ml-auto hover:text-[var(--text-secondary)] transition-colors">
                                  <Eye className="w-4 h-4" />
                                  {formatNumber(t.views_count)}
                                </span>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center">
                      <Database className="w-10 h-10 text-[var(--text-muted)]" />
                      <h3 className="text-[16px] font-bold text-[var(--text-primary)]">
                        No Saved DB Data Found
                      </h3>
                      <p className="text-[13px] text-[var(--text-secondary)] max-w-md">
                        No stored tweets were found for &quot;{activeKeyword}&quot; in the database yet. Click &quot;Fetch Nitter Keyword&quot; to stream live mentions directly into your analytics database.
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 2: Live Nitter Search */}
          {activeTab === "live" && (
            <div className="flex flex-col gap-6">
              {jobStatus?.tweets && jobStatus.tweets.length > 0 ? (
                <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col gap-6">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                    <div className="flex flex-col gap-0.5">
                      <h2 className="text-[18px] font-bold text-[var(--text-primary)]">
                        Live Search Results ({jobStatus.tweets.length} tweets)
                      </h2>
                      <p className="text-[13px] text-[var(--text-secondary)]">
                        {jobStatus.status === "running"
                          ? "Streaming live mentions from Nitter..."
                          : `Completed search for "${jobStatus.keyword}"`}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    {jobStatus.tweets.map((t, idx) => (
                      <article
                        key={`${t.id || "tweet"}-${idx}`}
                        className="p-5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] flex flex-col gap-3.5 hover:border-[var(--accent)]/50 transition-all shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center text-[13px] font-bold uppercase overflow-hidden shrink-0">
                              {t.avatar ? (
                                <img
                                  src={t.avatar}
                                  alt={t.username || "user"}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                (t.username || "??").slice(0, 2)
                              )}
                            </div>
                            <div className="flex flex-col">
                              {t.username ? (
                                <Link
                                  href={`/profile?username=${t.username}`}
                                  className="text-[14px] font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] no-underline"
                                >
                                  {t.fullname || `@${t.username}`}
                                </Link>
                              ) : (
                                <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                                  {t.fullname || "Unknown User"}
                                </span>
                              )}
                              <span className="text-[12px] text-[var(--text-secondary)]">
                                {t.username ? `@${t.username} • ` : ""}{formatDate(t.date || null)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {t.isRetweet && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20">
                                <Repeat2 className="w-3 h-3" /> RT
                              </span>
                            )}
                            {t.url && (
                              <a
                                href={t.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-all"
                                title="View Original Tweet"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>

                        <p className="text-[14px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
                          {t.content}
                        </p>

                        <div className="flex items-center gap-6 pt-3 border-t border-[var(--border)]/60 text-[12px] text-[var(--text-muted)]">
                          <span className="flex items-center gap-1.5 hover:text-[var(--text-secondary)] transition-colors">
                            <Heart className="w-4 h-4" />
                            {formatNumber(t.stats?.hearts)}
                          </span>
                          <span className="flex items-center gap-1.5 hover:text-[var(--text-secondary)] transition-colors">
                            <Repeat2 className="w-4 h-4" />
                            {formatNumber(t.stats?.retweets)}
                          </span>
                          <span className="flex items-center gap-1.5 hover:text-[var(--text-secondary)] transition-colors">
                            <MessageSquare className="w-4 h-4" />
                            {formatNumber(t.stats?.comments)}
                          </span>
                          {t.stats?.views && (
                            <span className="flex items-center gap-1.5 ml-auto hover:text-[var(--text-secondary)] transition-colors">
                              <Eye className="w-4 h-4" />
                              {formatNumber(t.stats?.views)}
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center">
                  <DownloadCloud className="w-10 h-10 text-[var(--text-muted)]" />
                  <h3 className="text-[16px] font-bold text-[var(--text-primary)]">
                    No Live Scraping Session Active
                  </h3>
                  <p className="text-[13px] text-[var(--text-secondary)] max-w-md">
                    Click &quot;Fetch Nitter Keyword&quot; above to start a live search job and stream real-time mentions from Nitter.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
