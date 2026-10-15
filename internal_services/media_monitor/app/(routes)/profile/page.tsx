"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertCircle, BarChart3, Bookmark, Calendar, Download, ExternalLink, Hash, Loader2, MessageSquare, Repeat2, Search, ThumbsUp, Timer, X } from "lucide-react";
import { fetchProfiles } from "@/app/actions/topics";
import ProfileAutocomplete from "@/components/ProfileAutocomplete";
import { getFlagEmoji, mapLocationToCountry } from "@/lib/countries";

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

interface DbTweet {
  id: string;
  raw_text: string;
  clean_text: string | null;
  created_at: string;
  likes_count: string;
  retweets_count: string;
  replies_count: string;
  views_count: string | null;
  lang: string | null;
  source: string | null;
  is_retweet: boolean;
  hashtags: string[];
  mentions: string[];
  urls: string[];
  media: string[];
  raw_tweet_json?: any;
}

interface AnalyseStats {
  total_tweets: string;
  total_hashtags: string;
  avg_likes: string | null;
  retweet_ratio: string | null;
  mostUsedHashtags: Array<{ hashtag: string; usage_count: string }>;
  languageDistribution: Array<{ lang: string; count: string }>;
  mostActivePostingHours: Array<{ hour: string; count: string }>;
}

interface SimilarTweetResult {
  tweet_id: string;
  text: string;
  model_name: string;
  embedded_at: string;
  score: number;
}

const PAGE_SIZE = 25;

const FETCH_DURATION_OPTIONS = [
  { label: "Now", value: "now" },
  { label: "30 min", value: "30" },
  { label: "1 hour", value: "60" },
  { label: "3 hours", value: "180" },
  { label: "5 hours", value: "300" },
  { label: "12 hours", value: "720" },
];

function formatNumber(value: string | number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AnalyseTweetsPage() {
  return (
    <Suspense fallback={<div className={"flex flex-col gap-4"}><Loader2 className={"w-4 h-4 animate-spin"} /></div>}>
      <AnalyseTweetsContent />
    </Suspense>
  );
}

function AnalyseTweetsContent() {
  const [username, setUsername] = useState("");
  const [activeUsername, setActiveUsername] = useState("");
  const [profile, setProfile] = useState<DbProfile | null>(null);
  const [stats, setStats] = useState<AnalyseStats | null>(null);
  const [tweets, setTweets] = useState<DbTweet[]>([]);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [totalTweets, setTotalTweets] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestingTarget, setIngestingTarget] = useState("");
  const [ingestProgress, setIngestProgress] = useState<number | null>(null);
  const [ingestJobMetadata, setIngestJobMetadata] = useState<any>(null);
  const [gapSize, setGapSize] = useState<number>(14);
  const [reprocessing, setReprocessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAttachments, setShowAttachments] = useState(false);
  const [similarityQuery, setSimilarityQuery] = useState("");
  const [similarityLoading, setSimilarityLoading] = useState(false);
  const [similarityResults, setSimilarityResults] = useState<SimilarTweetResult[]>([]);
  const [similarityError, setSimilarityError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [bookmarkedProfileTweets, setBookmarkedProfileTweets] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<any[]>([]);
  const [fetchDurationMinutes, setFetchDurationMinutes] = useState("now");
  const [fetchUntilDate, setFetchUntilDate] = useState("");
  const [viewFromDate, setViewFromDate] = useState("");
  const [viewToDate, setViewToDate] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [searchMode, setSearchMode] = useState<"semantic" | "normal">("normal");

  const searchParams = useSearchParams();
  const router = useRouter();

  const urlUsername = searchParams.get("username") || "";
  const urlPage = parseInt(searchParams.get("page") || "1", 10);

  // Sync username input with URL on mount
  useEffect(() => {
    if (urlUsername) {
      setUsername(urlUsername);
    }
  }, [urlUsername]);

  // Load profiles for autocomplete
  useEffect(() => {
    fetchProfiles().then(data => setProfiles((data as any[]) || [])).catch(() => { });
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (ingesting && ingestingTarget) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/analyse/progress?username=${encodeURIComponent(ingestingTarget)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.target > 0) {
              const perc = Math.min(Math.round((data.current / data.target) * 100), 100);
              setIngestProgress(perc);
            }
            if (data.metadata) {
              setIngestJobMetadata(data.metadata);
            }
          }
        } catch (e) {
          // ignore polling errors
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [ingesting, ingestingTarget]);

  // Handle data loading based on URL changes (e.g. back/forward navigation)
  useEffect(() => {
    if (urlUsername) {
      // Only load if the URL is different from what we've already loaded
      if (urlUsername !== activeUsername || urlPage !== page) {
        loadFromDb(urlUsername, urlPage);
      }
    } else {
      // Clear state if no username in URL
      setActiveUsername("");
      setProfile(null);
      setStats(null);
      setTweets([]);
      setTotalTweets(0);
      setPage(1);
      setPageInput("1");
    }
  }, [urlUsername, urlPage, activeUsername, page]);

  const updateUrl = (newUsername: string, newPage: number) => {
    const params = new URLSearchParams();
    if (newUsername) params.set("username", newUsername);
    if (newPage > 1) params.set("page", String(newPage));

    router.push(`?${params.toString()}`);
  };

  const loadFromDb = async (targetUsername: string, nextPage = 1, forceFromDate?: string, forceToDate?: string, forceSortOrder?: "desc" | "asc") => {
    const cleanUsername = targetUsername.replace("@", "").trim();
    if (!cleanUsername) return;

    setLoading(true);
    setError(null);

    const activeFrom = forceFromDate !== undefined ? forceFromDate : viewFromDate;
    const activeTo = forceToDate !== undefined ? forceToDate : viewToDate;
    const activeSort = forceSortOrder !== undefined ? forceSortOrder : sortOrder;

    try {
      const [profileRes, statsRes, tweetsRes] = await Promise.all([
        fetch(`/api/analyse/profile?username=${encodeURIComponent(cleanUsername)}`),
        fetch(`/api/analyse/stats?username=${encodeURIComponent(cleanUsername)}`),
        fetch(
          `/api/analyse/tweets?username=${encodeURIComponent(cleanUsername)}&page=${nextPage}&limit=${PAGE_SIZE}${activeFrom ? `&fromDate=${encodeURIComponent(activeFrom)}` : ""}${activeTo ? `&toDate=${encodeURIComponent(activeTo)}` : ""}&sort=${activeSort}`
        ),
      ]);

      if (!profileRes.ok) {
        throw new Error("No stored profile found. Use Fetch User to ingest this account first.");
      }
      if (!statsRes.ok || !tweetsRes.ok) {
        throw new Error("Could not load analysed data from the database.");
      }

      const profileJson = await profileRes.json();
      const statsJson = await statsRes.json();
      const tweetsJson = await tweetsRes.json();

      setActiveUsername(cleanUsername);
      setProfile(profileJson.profile);
      setStats(statsJson.stats);
      setTweets(tweetsJson.tweets);
      setTotalTweets(tweetsJson.total);
      setPage(nextPage);
      setPageInput(String(nextPage));
      // Load bookmarks for this profile
      loadProfileBookmarks(cleanUsername);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load database data.");
      setProfile(null);
      setStats(null);
      setTweets([]);
      setTotalTweets(0);
    } finally {
      setLoading(false);
    }
  };

  const loadProfileBookmarks = async (targetUsername: string) => {
    try {
      const res = await fetch(`/api/tweet/profile-bookmark?username=${encodeURIComponent(targetUsername)}`);
      if (res.ok) {
        const data = await res.json();
        setBookmarkedProfileTweets(new Set(data.bookmarks || []));
      }
    } catch (e) {
      // ignore
    }
  };

  const toggleProfileBookmark = async (tweetId: string) => {
    const isBookmarked = bookmarkedProfileTweets.has(tweetId);
    const action = isBookmarked ? "remove" : "add";
    // Optimistic update
    setBookmarkedProfileTweets(prev => {
      const next = new Set(prev);
      if (isBookmarked) next.delete(tweetId);
      else next.add(tweetId);
      return next;
    });
    try {
      await fetch("/api/tweet/profile-bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweetId, username: activeUsername, action }),
      });
    } catch (e) {
      // Revert on error
      setBookmarkedProfileTweets(prev => {
        const next = new Set(prev);
        if (isBookmarked) next.add(tweetId);
        else next.delete(tweetId);
        return next;
      });
    }
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanUsername = username.replace("@", "").trim();
    if (!cleanUsername) return;

    // Explicitly load, then sync URL
    await loadFromDb(cleanUsername, 1);
    updateUrl(cleanUsername, 1);
  };
  const handleClearSearch = () => {
    setSimilarityQuery("");
    setSimilarityResults([]);
    setSimilarityError(null);
    setHasSearched(false);
  };

  const handleSimilaritySearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanQuery = similarityQuery.trim();
    const scopedUsername = (activeUsername || username).replace("@", "").trim();
    if (!cleanQuery) return;
    if (!scopedUsername) {
      setSimilarityError("Load or enter a profile before running semantic search.");
      setHasSearched(true);
      return;
    }

    setSimilarityLoading(true);
    setSimilarityError(null);
    setHasSearched(true);

    try {
      const response = await fetch("/api/analyse/tweet-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: scopedUsername,
          query: cleanQuery,
          limit: 10,
          mode: searchMode,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to run similarity search.");
      }

      const results = payload.results || [];
      if (results.length === 0) {
        setSimilarityError("No similar tweets found for this search query.");
      }
      setSimilarityResults(results);
    } catch (err) {
      setSimilarityResults([]);
      setSimilarityError(err instanceof Error ? err.message : "Failed to run similarity search.");
    } finally {
      setSimilarityLoading(false);
    }
  };

  const NITTER_ERROR_SIGNATURE = "Unable to fetch profile from Nitter";
  const MAX_FETCH_RETRIES = 3;

  const handleFetchUser = async () => {
    const cleanUsername = username.replace("@", "").trim();
    if (!cleanUsername) return;

    setIngestingTarget(cleanUsername);
    setIngesting(true);
    setIngestProgress(0);
    setIngestJobMetadata(null);
    setError(null);

    let lastError = "";

    for (let attempt = 1; attempt <= MAX_FETCH_RETRIES; attempt++) {
      try {
        const response = await fetch("/api/analyse/fetch-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: cleanUsername,
            ...(fetchDurationMinutes !== "now" ? { fetchDurationMinutes: Number(fetchDurationMinutes) } : {}),
            ...(fetchUntilDate ? { fetchUntilDate } : {}),
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const errMsg: string = body.error || "Failed to fetch and ingest user.";

          // If it's a Nitter connectivity error, retry
          if (errMsg.includes(NITTER_ERROR_SIGNATURE)) {
            lastError = errMsg;
            if (attempt < MAX_FETCH_RETRIES) {
              // wait 1.5s between retries
              await new Promise((resolve) => setTimeout(resolve, 1500));
              continue;
            } else {
              // All retries exhausted
              throw new Error("Fetching service couldn't be connected.");
            }
          }

          throw new Error(errMsg);
        }
        if (response.status === 202) {
          // Job started in background. We need to poll until isComplete is true.
          while (true) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const progRes = await fetch(`/api/analyse/progress?username=${encodeURIComponent(cleanUsername)}`);
            if (progRes.ok) {
              const progData = await progRes.json();
              if (progData.isComplete) {
                break;
              }
              if (progData.error) {
                throw new Error(progData.error);
              }
            }
          }
        }

        // Success — load from DB and exit
        await loadFromDb(cleanUsername, 1);
        updateUrl(cleanUsername, 1);
        setIngestProgress(100);
        setTimeout(() => {
          setIngesting(false);
          setIngestingTarget("");
          setIngestProgress(null);
        }, 1000);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to ingest user.";

        // If it's already the friendly terminal message, just surface it
        if (msg === "Fetching service couldn't be connected.") {
          setError(msg);
          setIngesting(false);
          setIngestingTarget("");
          setIngestProgress(null);
          return;
        }

        // For non-Nitter errors, fail immediately without retrying
        setError(msg);
        setIngesting(false);
        setIngestingTarget("");
        setIngestProgress(null);
        return;
      }
    }

    // Fallback (shouldn't reach here normally)
    setError(lastError || "Fetching service couldn't be connected.");
    setIngesting(false);
    setIngestingTarget("");
    setIngestProgress(null);
  };

  const handleTopUp = async () => {
    const cleanUsername = username.replace("@", "").trim();
    if (!cleanUsername) return;

    setIngesting(true);
    setIngestingTarget(cleanUsername);
    setIngestProgress(0);
    setIngestJobMetadata(null);
    setError(null);

    try {
      const response = await fetch("/api/analyse/top-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: cleanUsername,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to start top up.");
      }

      if (response.status === 202) {
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const progRes = await fetch(`/api/analyse/progress?username=${encodeURIComponent(cleanUsername)}`);
          if (progRes.ok) {
            const progData = await progRes.json();
            if (progData.isComplete) {
              break;
            }
            if (progData.error) {
              throw new Error(progData.error);
            }
            if (progData.progress !== undefined) {
              setIngestProgress(progData.progress);
              setIngestJobMetadata(progData.metadata || null);
            }
          } else {
            const progData = await progRes.json().catch(() => ({}));
            if (progRes.status === 404 && progData.error === "Job not found") {
              break;
            }
          }
        }

        await loadFromDb(cleanUsername, 1);
        updateUrl(cleanUsername, 1);
        setIngestProgress(100);
        setTimeout(() => {
          setIngesting(false);
          setIngestingTarget("");
          setIngestProgress(null);
        }, 1000);
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to top up user.";
      setError(msg);
      setIngesting(false);
      setIngestingTarget("");
      setIngestProgress(null);
    }
  };

  const handleFetchReplies = async () => {
    const cleanUsername = username.replace("@", "").trim();
    if (!cleanUsername) return;

    setIngesting(true);
    setIngestingTarget(cleanUsername);
    setIngestProgress(0);
    setIngestJobMetadata(null);
    setError(null);

    try {
      const response = await fetch("/api/analyse/fetch-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: cleanUsername,
          ...(fetchUntilDate ? { fetchUntilDate } : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to start fetching replies.");
      }

      if (response.status === 202) {
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const progRes = await fetch(`/api/analyse/progress?username=${encodeURIComponent(cleanUsername)}`);
          if (progRes.ok) {
            const progData = await progRes.json();
            if (progData.isComplete) {
              break;
            }
            if (progData.error) {
              throw new Error(progData.error);
            }
            if (progData.progress !== undefined) {
              setIngestProgress(progData.progress);
            }
            if (progData.metadata) {
              setIngestJobMetadata(progData.metadata);
            }
          }
        }
      }

      await loadFromDb(cleanUsername, 1);
      updateUrl(cleanUsername, 1);
      setIngestProgress(100);
      setTimeout(() => {
        setIngesting(false);
        setIngestingTarget("");
        setIngestProgress(null);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch replies.");
      setIngesting(false);
      setIngestingTarget("");
      setIngestProgress(null);
    }
  };

  const handleFillGaps = async () => {
    const cleanUsername = username.replace("@", "").trim();
    if (!cleanUsername) return;

    setIngesting(true);
    setIngestingTarget(cleanUsername);
    setIngestProgress(0);
    setIngestJobMetadata(null);
    setError(null);

    try {
      const response = await fetch("/api/analyse/fill-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: cleanUsername,
          gapSize: gapSize,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to start filling gaps.");
      }

      if (response.status === 202) {
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const progRes = await fetch(`/api/analyse/progress?username=${encodeURIComponent(cleanUsername)}`);
          if (progRes.ok) {
            const progData = await progRes.json();
            if (progData.isComplete) {
              break;
            }
            if (progData.error) {
              throw new Error(progData.error);
            }
            if (progData.progress !== undefined) {
              setIngestProgress(progData.progress);
            }
            if (progData.metadata) {
              setIngestJobMetadata(progData.metadata);
            }
          }
        }
      }

      setIngestProgress(100);
      setTimeout(() => {
        setIngesting(false);
        setIngestingTarget("");
        setIngestProgress(null);
      }, 500);

      await loadFromDb(cleanUsername, 1);
      updateUrl(cleanUsername, 1);
    } catch (err) {
      setIngesting(false);
      setIngestingTarget("");
      setIngestProgress(null);
      setError(err instanceof Error ? err.message : "Failed to fill gaps.");
    }
  };

  const handleReprocess = async () => {
    const cleanUsername = username.replace("@", "").trim();
    if (!cleanUsername) return;

    setReprocessing(true);
    setError(null);

    try {
      const response = await fetch("/api/analyse/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to reprocess data.");
      }

      await loadFromDb(cleanUsername, 1);
      updateUrl(cleanUsername, 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reprocess data.");
    } finally {
      setReprocessing(false);
    }
  };

  const handleStopIngestion = async () => {
    const cleanUsername = (ingestingTarget || activeUsername || username).replace("@", "").trim();
    if (!cleanUsername) return;
    try {
      await fetch("/api/analyse/stop-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername }),
      });
    } catch (e) {
      console.error(e);
    }
    setIngesting(false);
    setIngestingTarget("");
    setIngestProgress(null);
    setError("Fetching stopped by user.");
  };

  const handleDownloadJsonl = () => {
    const cleanUsername = activeUsername || username.replace("@", "").trim();
    if (!cleanUsername) return;

    const url = `/api/analyse/download-jsonl?username=${encodeURIComponent(cleanUsername)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cleanUsername}_tweets.jsonl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadCsv = () => {
    const cleanUsername = activeUsername || username.replace("@", "").trim();
    if (!cleanUsername) return;

    const url = `/api/analyse/download-csv?username=${encodeURIComponent(cleanUsername)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cleanUsername}_tweets.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const totalPages = Math.max(Math.ceil(totalTweets / PAGE_SIZE), 1);
  const hasNextPage = page * PAGE_SIZE < totalTweets;

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetPage = parseInt(pageInput, 10);
    if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= totalPages) {
      loadFromDb(activeUsername, targetPage);
      updateUrl(activeUsername, targetPage);
    } else {
      setPageInput(String(page)); // reset if invalid
    }
  };

  return (
    <div className={"w-full flex justify-center pt-24 pb-20 px-6 sm:pt-12 sm:pb-10 sm:px-4"}>
      <div className={"w-full max-w-[960px] mx-auto flex flex-col gap-7 sm:gap-4"}>
        <div className={"w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 sm:p-4"}>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <ProfileAutocomplete
              profiles={profiles}
              value={username}
              onChange={(val) => setUsername(val)}
              onSelect={(val) => {
                setUsername(val);
              }}
              onSubmit={handleSearch as any}
              placeholder="Enter username"
              className="w-full sm:w-auto sm:flex-1"
              size="lg"
            />

            <div className="flex flex-wrap gap-2 sm:gap-3 items-stretch w-full sm:w-auto shrink-0">
              <label className={"flex-1 sm:flex-initial min-h-[46px] border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-primary)] font-bold inline-flex items-center justify-center gap-2 px-3 shrink-0"}>
                <Timer className={"w-4 h-4 text-[var(--text-muted)] shrink-0"} />
                <select
                  value={fetchDurationMinutes}
                  disabled={ingesting || loading || reprocessing}
                  onChange={(event) => setFetchDurationMinutes(event.target.value)}
                  className={"w-full bg-transparent outline-none text-sm font-bold cursor-pointer disabled:cursor-not-allowed text-[var(--text-primary)]"}
                  aria-label="Fetch duration"
                >
                  {FETCH_DURATION_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-[var(--bg-surface)] text-[var(--text-primary)]"
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label
                title="Fetch tweets up to this date only"
                className={"flex-1 sm:flex-initial min-h-[46px] border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-primary)] font-bold inline-flex items-center justify-center gap-2 px-3 shrink-0"}
              >
                <Calendar className={"w-4 h-4 text-[var(--text-muted)] shrink-0"} />
                <span className="text-xs text-[var(--text-muted)] hidden md:inline">Up to:</span>
                <input
                  type="date"
                  value={fetchUntilDate}
                  disabled={ingesting || loading || reprocessing}
                  onChange={(event) => setFetchUntilDate(event.target.value)}
                  className={"bg-transparent outline-none text-sm font-bold cursor-pointer disabled:cursor-not-allowed text-[var(--text-primary)]"}
                  aria-label="Fetch tweets up to date"
                />
                {fetchUntilDate && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setFetchUntilDate("");
                    }}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm font-bold ml-0.5"
                    title="Clear date filter"
                  >
                    ×
                  </button>
                )}
              </label>

              <button
                type="button"
                disabled={loading || ingesting || !username.trim()}
                onClick={handleSearch as any}
                className={"flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 min-h-[46px] rounded-lg font-bold cursor-pointer transition-all duration-150 bg-[var(--accent)] text-white disabled:opacity-55 disabled:cursor-not-allowed text-sm shadow-sm hover:bg-[var(--accent)]/90 shrink-0"}
              >
                {loading ? <Loader2 className={"w-4 h-4 animate-spin"} /> : "Search DB"}
              </button>
            </div>
          </div>

          <div className={`grid grid-cols-2 ${profile ? "sm:grid-cols-3 lg:grid-cols-6" : "sm:grid-cols-4"} items-stretch gap-2 sm:gap-3 mt-3.5`}>
            <button
              type="button"
              disabled={ingesting || loading || reprocessing || !username.trim()}
              className={"flex-1 min-h-[46px] border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-primary)] font-extrabold cursor-pointer inline-flex items-center justify-center gap-2 transition-all duration-150 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_90%)] disabled:opacity-55 disabled:cursor-not-allowed sm:w-full"}
              onClick={handleFetchUser}
            >
              {ingesting ? (
                <>
                  <Loader2 className={"w-4 h-4 animate-spin"} />
                  Fetching Tweets
                </>
              ) : (
                "Fetch Tweets"
              )}
            </button>

            <button
              type="button"
              disabled={ingesting || loading || reprocessing || !username.trim()}
              className={"flex-1 min-h-[46px] border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-primary)] font-extrabold cursor-pointer inline-flex items-center justify-center gap-2 transition-all duration-150 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_90%)] disabled:opacity-55 disabled:cursor-not-allowed sm:w-full"}
              onClick={handleTopUp}
            >
              {ingesting ? (
                <>
                  <Loader2 className={"w-4 h-4 animate-spin"} />
                  Topping Up
                </>
              ) : (
                "Top Up"
              )}
            </button>

            <button
              type="button"
              disabled={ingesting || loading || reprocessing || !username.trim()}
              className={"flex-1 min-h-[46px] border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-primary)] font-extrabold cursor-pointer inline-flex items-center justify-center gap-2 transition-all duration-150 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_90%)] disabled:opacity-55 disabled:cursor-not-allowed sm:w-full"}
              onClick={handleFetchReplies}
            >
              {ingesting ? (
                <>
                  <Loader2 className={"w-4 h-4 animate-spin"} />
                  Fetching Replies
                </>
              ) : (
                "Fetch Replies"
              )}
            </button>

            <div className="flex min-h-[46px] w-full border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] transition-all duration-150 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_90%)] focus-within:border-[var(--accent)] focus-within:bg-[color-mix(in_srgb,var(--accent),transparent_90%)] overflow-hidden">
              <button
                type="button"
                disabled={ingesting || loading || reprocessing || !username.trim()}
                className={"flex-1 h-auto text-[var(--text-primary)] font-extrabold cursor-pointer inline-flex items-center justify-center gap-2 bg-transparent border-none outline-none disabled:opacity-55 disabled:cursor-not-allowed"}
                onClick={handleFillGaps}
              >
                {ingesting ? (
                  <>
                    <Loader2 className={"w-4 h-4 animate-spin"} />
                    Filling
                  </>
                ) : (
                  "Fill Gaps"
                )}
              </button>
              <div className="relative flex items-center shrink-0 border-l border-[var(--border)]/50 bg-transparent w-[50px]">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={gapSize}
                  onChange={(e) => setGapSize(Math.max(1, Number(e.target.value)) || 14)}
                  disabled={ingesting || loading || reprocessing || !username.trim()}
                  className={"w-full h-full bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[13px] font-bold text-center pr-3 appearance-none focus:outline-none disabled:opacity-55 disabled:cursor-not-allowed [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"}
                  title="Minimum gap size to fill (days)"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--text-secondary)]/70 pointer-events-none select-none">
                  d
                </span>
              </div>
            </div>

            {profile && (
              <>
                <button
                  type="button"
                  disabled={ingesting || loading || reprocessing}
                  className={"flex-1 min-h-[46px] border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-primary)] font-extrabold cursor-pointer inline-flex items-center justify-center gap-2 transition-all duration-150 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_90%)] disabled:opacity-55 disabled:cursor-not-allowed sm:w-full"}
                  onClick={handleReprocess}
                >
                  {reprocessing ? (
                    <>
                      <Loader2 className={"w-4 h-4 animate-spin"} />
                      Reprocessing
                    </>
                  ) : (
                    "Reprocess DB"
                  )}
                </button>

                <button
                  type="button"
                  disabled={ingesting || loading || reprocessing}
                  className={"flex-1 min-h-[46px] border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-primary)] font-extrabold cursor-pointer inline-flex items-center justify-center gap-2 transition-all duration-150 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_90%)] disabled:opacity-55 disabled:cursor-not-allowed sm:w-full"}
                  onClick={() => window.open(`/analyse-profile/${activeUsername || username.replace("@", "").trim()}`, "_blank")}
                >
                  Analyse Profile
                </button>
              </>
            )}

            {ingesting && (
              <button
                type="button"
                onClick={handleStopIngestion}
                className={"flex-1 sm:col-span-2 min-h-[46px] border border-red-500/40 rounded-lg bg-red-500/15 text-red-400 font-extrabold cursor-pointer inline-flex items-center justify-center gap-2 transition-all duration-150 hover:bg-red-500/25 sm:w-full shadow-sm"}
              >
                <X className={"w-4 h-4"} />
                Stop Fetching
              </button>
            )}
          </div>

          {ingesting && (
            <div className={"mt-4 flex flex-col gap-2 bg-[var(--bg-subtle)]/60 p-3.5 rounded-xl border border-[var(--border)]"}>
              <div className={"flex justify-between items-center text-[13px] font-semibold text-[var(--text-secondary)]"}>
                <span className={"text-[var(--text-primary)] flex flex-col gap-1"}>
                  <span className="flex items-center gap-2">
                    <Loader2 className={"w-4 h-4 animate-spin text-[var(--accent)] shrink-0"} />
                    <span>Fetching Tweets for @{ingestingTarget || username.replace("@", "").trim()}...</span>
                  </span>
                  {ingestJobMetadata && ingestJobMetadata.totalGaps > 0 && (
                    <span className="text-xs text-[var(--text-secondary)] ml-6 flex flex-col gap-0.5">
                      <span className="text-[var(--accent)] font-medium">Filling gap {ingestJobMetadata.currentGapIndex || 0} of {ingestJobMetadata.totalGaps}</span>
                      {ingestJobMetadata.currentGapStart && ingestJobMetadata.currentGapEnd && (
                        <span>Searching timeline: {ingestJobMetadata.currentGapStart} to {ingestJobMetadata.currentGapEnd}</span>
                      )}
                    </span>
                  )}
                </span>
                <div className={"flex items-center gap-3 shrink-0"}>
                  <span>{ingestProgress !== null ? `${ingestProgress}%` : "Starting..."}</span>
                  <button
                    type="button"
                    onClick={handleStopIngestion}
                    className={"text-xs font-bold px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 cursor-pointer flex items-center gap-1.5 transition-all shadow-sm"}
                  >
                    <X className={"w-3.5 h-3.5"} /> Stop
                  </button>
                </div>
              </div>
              {ingestProgress !== null && (
                <div className={"w-full h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden mt-1 border border-[var(--border-subtle)]"}>
                  <div
                    className={"h-full bg-[var(--accent)] rounded-full transition-all duration-300"}
                    style={{ width: `${ingestProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className={"flex gap-3 items-start p-4 rounded-lg border border-[color-mix(in_srgb,var(--down),transparent_72%)] bg-[color-mix(in_srgb,var(--down),transparent_94%)] text-[var(--down)]"}>
            <AlertCircle size={18} />
            <p>{error}</p>
          </div>
        )}

        {profile && (
          <div className={"w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl overflow-hidden"}>
            <div className={"p-6 sm:px-4 sm:pt-[18px] sm:pb-0"}>
              <div className={"grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)] gap-4 sm:gap-3 items-center"}>
                {profile.profile_image_url && (
                  <div className={"w-[76px] h-[76px] sm:w-16 sm:h-16 p-[3px] rounded-full bg-[var(--bg-surface)] border border-[var(--border)]"}>
                    <img
                      src={profile.profile_image_url}
                      alt={profile.display_name || profile.username}
                      className={"w-full h-full rounded-full object-cover border border-[var(--border)]"}
                    />
                  </div>
                )}
                <div className={"min-w-0"}>
                  <h2 className={"m-0 text-2xl sm:text-[22px] leading-[1.15] font-extrabold tracking-normal"}>{profile.display_name || profile.username}</h2>
                  <p className={"mt-1 text-[var(--text-muted)] text-sm"}>@{profile.username}</p>
                </div>
              </div>

              {profile.bio && <p className={"mt-5 text-[var(--text-primary)] text-[15px] leading-[1.7]"}>{profile.bio}</p>}

              <div className={"flex flex-wrap gap-x-5 gap-y-2.5 mt-[18px] text-[var(--text-muted)] text-sm"}>
                {profile.location && (
                  <span className={"inline-flex items-center gap-1.5"}>
                    {getFlagEmoji(mapLocationToCountry(profile.location) || "")} {profile.location}
                  </span>
                )}
                <span className={"inline-flex items-center gap-1.5"}>Scraped {formatDate(profile.scraped_at)}</span>
              </div>

              <div className={"grid grid-cols-4 gap-2.5 mt-[22px] pt-[22px] border-t border-[var(--border)] mb-6"}>
                <div className={"p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]"}>
                  <span className={"block text-[var(--text-primary)] text-lg leading-[1.2] font-extrabold"}>{formatNumber(profile.tweet_count)}</span>
                  <span className={"block mt-1 text-[var(--text-muted)] text-xs"}>Tweets</span>
                </div>
                <div className={"p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]"}>
                  <span className={"block text-[var(--text-primary)] text-lg leading-[1.2] font-extrabold"}>{formatNumber(profile.followers_count)}</span>
                  <span className={"block mt-1 text-[var(--text-muted)] text-xs"}>Followers</span>
                </div>
                <div className={"p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]"}>
                  <span className={"block text-[var(--text-primary)] text-lg leading-[1.2] font-extrabold"}>{formatNumber(profile.following_count)}</span>
                  <span className={"block mt-1 text-[var(--text-muted)] text-xs"}>Following</span>
                </div>
                <div className={"p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]"}>
                  <span className={"block text-[var(--text-primary)] text-lg leading-[1.2] font-extrabold"}>{formatNumber(totalTweets)}</span>
                  <span className={"block mt-1 text-[var(--text-muted)] text-xs"}>Stored</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {stats && (
          <div className={"flex flex-col gap-3"}>
            <section className={"grid grid-cols-4 gap-3"}>
              <div className={"bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 min-h-[118px] flex flex-col gap-2 text-[var(--text-muted)]"}>
                <BarChart3 size={18} />
                <span>Total tweets</span>
                <strong className={"mt-auto text-[var(--text-primary)] text-[22px] leading-[1.1] font-extrabold"}>{formatNumber(stats.total_tweets)}</strong>
              </div>
              <div className={"bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 min-h-[118px] flex flex-col gap-2 text-[var(--text-muted)]"}>
                <Hash size={18} />
                <span>Total hashtags</span>
                <strong className={"mt-auto text-[var(--text-primary)] text-[22px] leading-[1.1] font-extrabold"}>{formatNumber(stats.total_hashtags)}</strong>
              </div>
              <div className={"bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 min-h-[118px] flex flex-col gap-2 text-[var(--text-muted)]"}>
                <ThumbsUp size={18} />
                <span>Avg likes</span>
                <strong className={"mt-auto text-[var(--text-primary)] text-[22px] leading-[1.1] font-extrabold"}>{formatNumber(stats.avg_likes)}</strong>
              </div>
              <div className={"bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 min-h-[118px] flex flex-col gap-2 text-[var(--text-muted)]"}>
                <Repeat2 size={18} />
                <span>Retweet ratio</span>
                <strong className={"mt-auto text-[var(--text-primary)] text-[22px] leading-[1.1] font-extrabold"}>{Math.round(Number(stats.retweet_ratio || 0) * 100)}%</strong>
              </div>
            </section>

            <section className={"grid grid-cols-3 gap-3"}>
              <div className={"bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 text-[var(--text-secondary)] leading-[1.6]"}>
                <strong className={"block mb-2 text-[var(--text-primary)]"}>Most used hashtags</strong>
                <p>
                  {stats.mostUsedHashtags.length
                    ? stats.mostUsedHashtags
                      .map((item) => `#${item.hashtag} (${item.usage_count})`)
                      .join(", ")
                    : "No hashtags stored yet."}
                </p>
              </div>
              <div className={"bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 text-[var(--text-secondary)] leading-[1.6]"}>
                <strong className={"block mb-2 text-[var(--text-primary)]"}>Language distribution</strong>
                <p>
                  {stats.languageDistribution
                    .map((item) => `${item.lang}: ${item.count}`)
                    .join(", ")}
                </p>
              </div>
              <div className={"bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 text-[var(--text-secondary)] leading-[1.6]"}>
                <strong className={"block mb-2 text-[var(--text-primary)]"}>Most active hours</strong>
                <p>
                  {stats.mostActivePostingHours
                    .map((item) => `${item.hour}:00 (${item.count})`)
                    .join(", ")}
                </p>
              </div>
            </section>
          </div>
        )}

        {loading && !tweets.length && (
          <div className={"flex flex-col gap-4"}>
            <div className={"w-full h-[132px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] animate-pulse opacity-55"} />
            <div className={"w-full h-[132px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] animate-pulse opacity-55"} />
          </div>
        )}

        {(!!tweets.length || viewFromDate || viewToDate) && (
          <div className={"flex flex-col gap-4 sm:gap-[14px]"}>
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 mb-2 border-b border-[var(--border-subtle)]">
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-semibold text-[var(--text-primary)]">
                  Tweets Stored in DB: {formatNumber(totalTweets)}
                </span>
                
                <div className="hidden sm:block h-5 w-px bg-[var(--border-subtle)]"></div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-sm">
                    <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
                    <input 
                      type="date" 
                      value={viewFromDate} 
                      onChange={(e) => setViewFromDate(e.target.value)}
                      className="bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none cursor-pointer"
                      title="From Date"
                    />
                    <span className="text-[var(--text-muted)] text-sm font-medium mx-0.5">to</span>
                    <input 
                      type="date" 
                      value={viewToDate} 
                      onChange={(e) => setViewToDate(e.target.value)}
                      className="bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none cursor-pointer"
                      title="To Date"
                    />
                    {(viewFromDate || viewToDate) && (
                      <button 
                        onClick={() => {
                          setViewFromDate("");
                          setViewToDate("");
                          loadFromDb(activeUsername, 1, "", "", sortOrder);
                          updateUrl(activeUsername, 1);
                        }}
                        className="ml-1 text-[var(--text-muted)] hover:text-red-400 transition-colors"
                        title="Clear Dates"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-sm">
                    <select
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value as "desc" | "asc")}
                      className="bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none cursor-pointer"
                    >
                      <option value="desc">Newest First</option>
                      <option value="asc">Oldest First</option>
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      loadFromDb(activeUsername, 1);
                      updateUrl(activeUsername, 1);
                    }}
                    disabled={loading}
                    className="px-4 py-1.5 bg-[var(--accent)] text-white text-sm font-bold rounded-lg shadow-sm hover:opacity-90 transition-opacity disabled:opacity-55"
                  >
                    Filter
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  type="button"
                  disabled={ingesting || loading || reprocessing}
                  className={"min-h-[38px] px-4 border border-[var(--border)] rounded-lg bg-[var(--bg-surface)] text-[var(--text-secondary)] text-[13px] font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5 transition-all duration-150 hover:border-[var(--up)] hover:bg-[color-mix(in_srgb,var(--up),transparent_92%)] hover:text-[var(--up)] disabled:opacity-55 disabled:cursor-not-allowed sm:w-full sm:min-h-[44px]"}
                  onClick={handleDownloadJsonl}
                  style={{ minHeight: '32px', height: '32px', padding: '0 12px', fontSize: '12px' }}
                >
                  <Download size={12} />
                  Download JSONL
                </button>
                <button
                  type="button"
                  disabled={ingesting || loading || reprocessing}
                  className={"min-h-[38px] px-4 border border-[var(--border)] rounded-lg bg-[var(--bg-surface)] text-[var(--text-secondary)] text-[13px] font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5 transition-all duration-150 hover:border-[var(--up)] hover:bg-[color-mix(in_srgb,var(--up),transparent_92%)] hover:text-[var(--up)] disabled:opacity-55 disabled:cursor-not-allowed sm:w-full sm:min-h-[44px]"}
                  onClick={handleDownloadCsv}
                  style={{ minHeight: '32px', height: '32px', padding: '0 12px', fontSize: '12px' }}
                >
                  <Download size={12} />
                  Download CSV
                </button>
                <label style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}>
                  <input
                    type="checkbox"
                    checked={showAttachments}
                    onChange={(e) => setShowAttachments(e.target.checked)}
                    style={{
                      width: '16px',
                      height: '16px',
                      accentColor: 'var(--accent)',
                      cursor: 'pointer'
                    }}
                  />
                  Show Attachments
                </label>
              </div>
            </div>

            <div style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '24px',
              background: 'color-mix(in srgb, var(--accent), transparent 99%)',
              marginBottom: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: hasSearched ? '14px' : '0'
            }}>
              <form onSubmit={handleSimilaritySearch} className={"grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-1 gap-3 items-stretch"}>
                <div className={"relative"} style={{ position: 'relative' }}>
                  <div className={"absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--text-muted)] pointer-events-none"}>
                    <Search />
                  </div>
                  <input
                    type="text"
                    value={similarityQuery}
                    onChange={(event) => {
                      const val = event.target.value;
                      setSimilarityQuery(val);
                      if (!val.trim()) {
                        setSimilarityResults([]);
                        setSimilarityError(null);
                        setHasSearched(false);
                        setSimilarityLoading(false);
                      }
                    }}
                    placeholder={searchMode === "semantic" ? "Semantic search..." : "Search tweets..."}
                    className={"w-full min-h-[52px] px-4 pl-12 border border-[var(--border)] rounded-lg bg-transparent text-[var(--text-primary)] outline-none transition-all duration-150 focus:border-[var(--accent)] focus:ring-3 focus:ring-[color-mix(in_srgb,var(--accent),transparent_72%)]"}
                    style={{ paddingRight: similarityQuery ? '11rem' : '9rem' }}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {similarityQuery && (
                      <button
                        type="button"
                        onClick={handleClearSearch}
                        className="p-1 text-[var(--text-secondary)] hover:text-red-400 transition-colors flex items-center justify-center"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <select
                      value={searchMode}
                      onChange={(e) => setSearchMode(e.target.value as "semantic" | "normal")}
                      className="bg-[var(--bg-subtle)] text-[var(--text-primary)] text-[12px] font-bold border border-[var(--border)] rounded-md px-2 py-1.5 outline-none cursor-pointer hover:border-[var(--text-muted)] transition-colors shadow-sm"
                    >
                      <option value="normal" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Normal Search</option>
                      <option value="semantic" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">Semantic Search</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={similarityLoading || !similarityQuery.trim()}
                  className={"inline-flex items-center justify-center gap-2 px-6 min-h-[52px] rounded-lg font-bold cursor-pointer transition-all duration-150 bg-[var(--accent)] text-white disabled:opacity-55 disabled:cursor-not-allowed sm:w-full shadow-sm"}
                >
                  {similarityLoading ? <Loader2 className={"w-4 h-4 animate-spin"} /> : "Search"}
                </button>
              </form>

              {hasSearched && (
                <div style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {similarityLoading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      <Loader2 className={"w-4 h-4 animate-spin"} size={16} />
                      <span>Searching similarity...</span>
                    </div>
                  )}

                  {similarityError && (
                    <div className={"flex gap-3 items-start p-4 rounded-lg border border-[color-mix(in_srgb,var(--down),transparent_72%)] bg-[color-mix(in_srgb,var(--down),transparent_94%)] text-[var(--down)]"} style={{ margin: 0 }}>
                      <AlertCircle size={18} />
                      <p>{similarityError}</p>
                    </div>
                  )}

                  {!similarityLoading && !similarityError && similarityResults.length === 0 && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                      No similar tweets found.
                    </div>
                  )}

                  {!similarityLoading && similarityResults.length > 0 && (
                    <div style={{ display: "grid", gap: "0.75rem" }}>
                      {similarityResults.map((result) => (
                        <article key={result.tweet_id} className={"w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 sm:p-4"} style={{ margin: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "0.75rem",
                              flexWrap: "wrap",
                              marginBottom: "0.5rem",
                            }}
                          >
                            <span className={"text-[var(--text-primary)] text-sm font-extrabold"}>{result.tweet_id}</span>
                            <span className={"text-[var(--text-muted)] text-[13px]"}>
                              score {result.score.toFixed(4)} | {result.model_name} | {formatDate(result.embedded_at)}
                            </span>
                          </div>
                          <p className={"text-[var(--text-primary)] text-[15px] leading-[1.65] whitespace-pre-wrap break-words"}>{result.text}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {tweets.map((tweet) => (
              <article
                key={tweet.id}
                className={"w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 sm:p-4"}
                style={tweet.is_retweet ? {
                  borderLeft: '4px solid #10b981',
                  background: 'color-mix(in srgb, #10b981, transparent 98%)'
                } : undefined}
              >
                {tweet.is_retweet && (
                  <div style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.25rem 0.6rem",
                    borderRadius: "6px",
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    color: "#10b981",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.75rem"
                  }}>
                    <Repeat2 size={13} strokeWidth={2.5} />
                    <span>RETWEETED BY @{activeUsername.toUpperCase()}</span>
                  </div>
                )}
                <div className={"flex justify-between gap-3 mb-2"}>
                  <div className={"flex flex-wrap gap-x-[7px] gap-y-[2px] min-w-0 items-baseline"}>
                    {tweet.is_retweet ? (
                      <>
                        <span className={"text-[var(--text-primary)] text-sm font-extrabold"}>
                          {tweet.raw_tweet_json?.fullname || "Original Author"}
                        </span>
                        <span className={"text-[var(--text-muted)] text-[13px]"}>
                          {tweet.raw_tweet_json?.username || ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={"text-[var(--text-primary)] text-sm font-extrabold"}>
                          {profile?.display_name || activeUsername}
                        </span>
                        <span className={"text-[var(--text-muted)] text-[13px]"}>@{activeUsername}</span>
                      </>
                    )}
                    <span className={"text-[var(--text-muted)] text-[13px]"}>
                      <Calendar size={13} /> {formatDate(tweet.created_at)}
                    </span>
                    <span className={"text-[var(--text-muted)] text-[13px]"}>{tweet.lang || "und"}</span>
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => router.push(`/tweet?id=${tweet.id}&username=${activeUsername}`)}
                      className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all cursor-pointer"
                      title="Open in analysis page"
                    >
                      <BarChart3 size={13} />
                    </button>
                    <a
                      href={`https://x.com/${activeUsername}/status/${tweet.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all cursor-pointer inline-flex items-center justify-center"
                      title="Open in X"
                    >
                      <ExternalLink size={13} />
                    </a>
                    <button
                      type="button"
                      onClick={() => toggleProfileBookmark(tweet.id)}
                      className={`p-1.5 rounded-md border transition-all cursor-pointer ${bookmarkedProfileTweets.has(tweet.id)
                          ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                          : "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]"
                        }`}
                      title={bookmarkedProfileTweets.has(tweet.id) ? "Remove Bookmark" : "Bookmark Tweet"}
                    >
                      <Bookmark size={13} className={bookmarkedProfileTweets.has(tweet.id) ? "fill-current" : ""} />
                    </button>
                  </div>
                </div>

                <p className={"text-[var(--text-primary)] text-[15px] leading-[1.65] whitespace-pre-wrap break-words"}>{tweet.raw_text}</p>

                {!!tweet.hashtags?.length && (
                  <div className={"flex flex-wrap gap-2 mt-[14px]"}>
                    {tweet.hashtags.map((hashtag) => (
                      <span key={hashtag}>#{hashtag}</span>
                    ))}
                  </div>
                )}

                {showAttachments && Array.isArray(tweet.media) && tweet.media.length > 0 && (
                  <div className={`grid gap-2 mt-[14px] overflow-hidden border border-[var(--border)] rounded-xl ${tweet.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {tweet.media.map((imgUrl: string, idx: number) => (
                      <img
                        key={idx}
                        src={imgUrl}
                        alt="Tweet attachment"
                        className={"w-full h-auto max-h-[480px] object-contain bg-[#090d13] block"}
                        loading="lazy"
                      />
                    ))}
                  </div>
                )}

                {tweet.raw_tweet_json?.quote && (
                  <div className={"mt-4 p-[14px] border border-[var(--border)] rounded-xl transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--accent),transparent_95%)]"}>
                    <div className={"flex items-center gap-[7px] mb-2"}>
                      {tweet.raw_tweet_json.quote.avatar ? (
                        <img
                          src={tweet.raw_tweet_json.quote.avatar}
                          alt={tweet.raw_tweet_json.quote.fullname}
                          className={"w-[18px] h-[18px] rounded-full object-cover"}
                        />
                      ) : (
                        <div className={"w-[18px] h-[18px] rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)]"} />
                      )}
                      <span className={"text-[var(--text-primary)] text-[13px] font-extrabold"}>
                        {tweet.raw_tweet_json.quote.fullname}
                      </span>
                      <span className={"text-[var(--text-muted)] text-[13px] leading-[1.55]"}>
                        {tweet.raw_tweet_json.quote.username}
                      </span>
                      <span className={"text-[var(--text-muted)] text-[13px] leading-[1.55]"} style={{ marginLeft: "auto", fontSize: "0.75rem" }}>
                        {tweet.raw_tweet_json.quote.date}
                      </span>
                    </div>
                    <p className={"text-[var(--text-muted)] text-[13px] leading-[1.55]"}>{tweet.raw_tweet_json.quote.content}</p>

                    {showAttachments && Array.isArray(tweet.raw_tweet_json.quote.media) && tweet.raw_tweet_json.quote.media.length > 0 && (
                      <div className={`grid gap-2 mt-[14px] overflow-hidden border border-[var(--border)] rounded-xl ${tweet.raw_tweet_json.quote.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`} style={{ marginTop: "8px" }}>
                        {tweet.raw_tweet_json.quote.media.map((imgUrl: string, idx: number) => (
                          <img
                            key={idx}
                            src={imgUrl}
                            alt="Quoted attachment"
                            className={"w-full h-auto max-h-[480px] object-contain bg-[#090d13] block"}
                            loading="lazy"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className={"flex items-center gap-[22px] sm:gap-4 mt-4 text-[var(--text-muted)]"}>
                  <span className={"inline-flex items-center gap-1.5 border-0 p-0 bg-transparent text-inherit text-xs"}>
                    <MessageSquare size={16} />
                    {formatNumber(tweet.replies_count)}
                  </span>
                  <span className={"inline-flex items-center gap-1.5 border-0 p-0 bg-transparent text-inherit text-xs"}>
                    <Repeat2 size={16} />
                    {formatNumber(tweet.retweets_count)}
                  </span>
                  <span className={"inline-flex items-center gap-1.5 border-0 p-0 bg-transparent text-inherit text-xs"}>
                    <ThumbsUp size={16} />
                    {formatNumber(tweet.likes_count)}
                  </span>
                  {tweet.views_count && (
                    <span className={"inline-flex items-center gap-1.5 border-0 p-0 bg-transparent text-inherit text-xs ml-auto"}>
                      {formatNumber(tweet.views_count)} views
                    </span>
                  )}
                </div>
              </article>
            ))}

            <div className={"flex items-center justify-between gap-3 text-[var(--text-muted)] text-[13px] sm:flex-wrap"}>
              <button
                className={"inline-flex items-center justify-center gap-2 px-6 min-h-[52px] border border-[var(--border)] rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] font-bold cursor-pointer transition-all duration-150 disabled:opacity-55 disabled:cursor-not-allowed"}
                disabled={page <= 1 || loading}
                onClick={() => {
                  loadFromDb(activeUsername, page - 1);
                  updateUrl(activeUsername, page - 1);
                }}
              >
                Previous
              </button>

              <form onSubmit={handlePageSubmit} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>Page</span>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  style={{ width: '60px', padding: '0.25rem', textAlign: 'center', borderRadius: '4px', border: '1px solid #ccc' }}
                  disabled={loading}
                />
                <span>of {totalPages}</span>
                <button type="submit" disabled={loading} style={{ padding: '0.25rem 0.5rem', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ccc', background: '#f5f5f5' }}>Go</button>
              </form>

              <button
                className={"inline-flex items-center justify-center gap-2 px-6 min-h-[52px] border border-[var(--border)] rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] font-bold cursor-pointer transition-all duration-150 disabled:opacity-55 disabled:cursor-not-allowed"}
                disabled={!hasNextPage || loading}
                onClick={() => {
                  loadFromDb(activeUsername, page + 1);
                  updateUrl(activeUsername, page + 1);
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
