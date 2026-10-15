"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  Loader2,
  Search,
  Heart,
  Repeat2,
  MessageSquare,
  Eye,
  ArrowLeft,
  Calendar,
  ExternalLink,
  Download,
  BarChart3,
  Bookmark,
  RefreshCw,
  Trash2,
} from "lucide-react";

interface NitterTweet {
  id: string;
  url: string;
  avatar: string;
  fullname: string;
  username: string;
  date: string;
  content: string;
  stats: {
    comments: string;
    retweets: string;
    hearts: string;
    views: string;
  };
  media: string[];
  isRetweet: boolean;
  isReply: boolean;
  replyToUsers: string[];
  isUnavailable?: boolean;
  isBookmarked?: boolean;
}

interface NitterTweetDetails {
  mainTweet: NitterTweet | null;
  replies: NitterTweet[];
}

export default function AnalyseTweetPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      }
    >
      <AnalyseTweetContent />
    </Suspense>
  );
}

function formatNumber(value: string | number | null | undefined) {
  if (!value) return "0";
  const num = Number(String(value).replace(/[^\d]/g, ""));
  return isNaN(num) ? "0" : num.toLocaleString();
}

function formatTweetText(text: string) {
  if (!text) return "";
  return text.split(/(\s+)/).map((part, i) => {
    if (part.startsWith("#")) {
      return (
        <span key={i} className="text-[var(--accent)] hover:underline cursor-pointer">
          {part}
        </span>
      );
    }
    if (part.startsWith("@")) {
      return (
        <span key={i} className="text-[var(--accent)] hover:underline cursor-pointer">
          {part}
        </span>
      );
    }
    if (part.startsWith("http://") || part.startsWith("https://")) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent)] hover:underline break-all"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function AnalyseTweetContent() {
  const [urlInput, setUrlInput] = useState("");
  const [activeTweetId, setActiveTweetId] = useState("");
  const [mainTweet, setMainTweet] = useState<NitterTweet | null>(null);
  const [replies, setReplies] = useState<NitterTweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [isDeletingReplies, setIsDeletingReplies] = useState(false);

  const isRefetching = loading && !!mainTweet;
  const isInitialLoading = loading && !mainTweet;
  const isActionDisabled = isRefetching || isDeletingReplies;

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const searchParams = useSearchParams();
  const router = useRouter();

  const urlId = searchParams.get("id") || "";
  const urlUsername = searchParams.get("username") || "";

  useEffect(() => {
    if (urlId) {
      setUrlInput(
        urlUsername
          ? `https://x.com/${urlUsername}/status/${urlId}`
          : `https://x.com/i/status/${urlId}`
      );
      setActiveTweetId(urlId);
      fetchTweetDetails(urlId, urlUsername);
    } else {
      setUrlInput("");
      setActiveTweetId("");
      setMainTweet(null);
      setReplies([]);
      setError(null);
    }
  }, [urlId, urlUsername]);

  const toggleBookmark = async (tweetId: string, type: 'tweet' | 'reply') => {
    const isBookmarked = bookmarks.has(tweetId);
    const action = isBookmarked ? "remove" : "add";

    // Optimistic UI update
    setBookmarks(prev => {
      const next = new Set(prev);
      if (isBookmarked) next.delete(tweetId);
      else next.add(tweetId);
      return next;
    });

    try {
      await fetch('/api/tweet/bookmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweetId, rootTweetId: urlId, type, action })
      });
    } catch (e) {
      // Revert on error
      setBookmarks(prev => {
        const next = new Set(prev);
        if (isBookmarked) next.add(tweetId);
        else next.delete(tweetId);
        return next;
      });
    }
  };

  const fetchTweetDetails = async (id: string, username: string, force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyse/tweet?id=${id}&username=${username}${force ? "&force=true" : ""}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to fetch tweet details");
      }
      const data: NitterTweetDetails = await res.json();
      setMainTweet(data.mainTweet);
      setReplies(data.replies || []);
      setCurrentPage(1);

      // Read bookmark status directly from payload
      const loadedBookmarks = new Set<string>();
      if (data.mainTweet?.isBookmarked) {
        loadedBookmarks.add(data.mainTweet.id);
      }
      data.replies?.forEach(reply => {
        if (reply.isBookmarked) {
          loadedBookmarks.add(reply.id);
        }
      });
      setBookmarks(loadedBookmarks);

      // Fetch bookmarks
      fetch(`/api/tweet/bookmark?rootTweetId=${id}`)
        .then(r => r.json())
        .then(d => {
          if (d.bookmarks) {
            setBookmarks(new Set(d.bookmarks));
          }
        })
        .catch(e => console.error("Failed to fetch bookmarks:", e));

      // Update localStorage history with username and snippet
      if (data.mainTweet) {
        try {
          const historyStr = localStorage.getItem("tweet_history");
          let history: any[] = historyStr ? JSON.parse(historyStr) : [];
          const existingIdx = history.findIndex((h) => h.id === id);
          if (existingIdx !== -1) {
            history[existingIdx] = {
              ...history[existingIdx],
              username: data.mainTweet.username.replace("@", ""),
              text: data.mainTweet.content,
            };
          } else {
            history.unshift({
              id,
              url: `https://x.com/${data.mainTweet.username.replace("@", "")}/status/${id}`,
              username: data.mainTweet.username.replace("@", ""),
              text: data.mainTweet.content,
            });
          }
          localStorage.setItem("tweet_history", JSON.stringify(history.slice(0, 10)));
        } catch (e) {
          console.error("Failed to update tweet history", e);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tweet details");
      setMainTweet(null);
      setReplies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReplies = async () => {
    if (!confirm("Are you sure you want to delete all cached replies for this tweet? This will also clear any stance/summary analysis.")) {
      return;
    }

    setIsDeletingReplies(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyse/tweet?id=${activeTweetId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete replies");
      }
      setReplies([]);
      setCurrentPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete replies");
    } finally {
      setIsDeletingReplies(false);
    }
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    let tweetId = trimmed;
    let username = "";

    try {
      const parsedUrl = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      if (parsedUrl.hostname.includes("twitter.com") || parsedUrl.hostname.includes("x.com")) {
        const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
        const statusIndex = pathParts.indexOf("status");
        if (statusIndex !== -1 && pathParts.length > statusIndex + 1) {
          tweetId = pathParts[statusIndex + 1];
          username = pathParts[statusIndex - 1] || "";
        }
      }
    } catch (e) {
      // ignore
    }

    if (!tweetId || !/^\d+$/.test(tweetId)) {
      if (/^\d+$/.test(trimmed)) {
        tweetId = trimmed;
      } else {
        setError("Invalid tweet URL or ID. Please enter a valid x.com or twitter.com tweet link.");
        return;
      }
    }

    router.push(`?id=${tweetId}${username ? `&username=${username}` : ""}`);
  };

  // Pagination helper calculations
  const totalReplies = replies.length;
  const totalPages = Math.max(Math.ceil(totalReplies / pageSize), 1);
  const paginatedReplies = replies.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  return (
    <div className="w-full flex justify-center pt-10 pb-20 px-6 sm:pt-6 sm:pb-10 sm:px-4">
      <div className="w-full max-w-[960px] mx-auto flex flex-col gap-6 sm:gap-4">
        {/* Navigation & Header Search Panel */}
        <div className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 sm:p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_95%)] transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Search
            </button>
          </div>

          <form onSubmit={handleSearchSubmit} className="grid grid-cols-[8.5fr_1.5fr] gap-3 items-stretch">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--text-muted)] pointer-events-none">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={urlInput}
                onChange={(event) => {
                  setUrlInput(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter tweet URL or ID"
                className="w-full min-h-[50px] px-4 pl-12 border border-[var(--border)] rounded-lg bg-transparent text-[var(--text-primary)] outline-none transition-all duration-150 focus:border-[var(--accent)] focus:ring-3 focus:ring-[color-mix(in_srgb,var(--accent),transparent_72%)]"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !urlInput.trim()}
              className="inline-flex items-center justify-center gap-2 px-6 min-h-[50px] rounded-lg font-bold cursor-pointer transition-all duration-150 bg-[var(--accent)] text-white disabled:opacity-55 disabled:cursor-not-allowed hover:opacity-85"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
            </button>
          </form>

          {mainTweet && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 mt-3.5">
              <button
                type="button"
                disabled={isActionDisabled}
                onClick={() => fetchTweetDetails(mainTweet.id, mainTweet.username.replace('@', ''), true)}
                className="flex-1 min-h-[46px] border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-primary)] font-extrabold cursor-pointer inline-flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-55 disabled:cursor-not-allowed hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_90%)] sm:w-full text-sm"
                title="Re-Fetch Replies from Nitter"
              >
                <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin text-[var(--accent)]" : ""}`} />
                {isRefetching ? "Refetching..." : "Re-Fetch Replies"}
              </button>
              <button
                type="button"
                disabled={isActionDisabled}
                onClick={() => !isActionDisabled && router.push(`/analyse-tweet?id=${mainTweet.id}&username=${mainTweet.username.replace('@', '')}`)}
                className="flex-1 min-h-[46px] border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-primary)] font-extrabold cursor-pointer inline-flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-55 disabled:cursor-not-allowed hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_90%)] sm:w-full text-sm"
                title="Stance Analysis"
              >
                <BarChart3 className="w-4 h-4" />
                Stance Analytics
              </button>
              <button
                type="button"
                disabled={isActionDisabled}
                onClick={() => !isActionDisabled && window.open(`https://x.com/${mainTweet.username.replace('@', '')}/status/${mainTweet.id}`, "_blank")}
                className="flex-1 min-h-[46px] border border-[var(--border)] rounded-lg bg-[var(--bg-subtle)] text-[var(--text-primary)] font-extrabold cursor-pointer inline-flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-55 disabled:cursor-not-allowed hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_90%)] sm:w-full text-sm"
                title="View on X.com"
              >
                <ExternalLink className="w-4 h-4" />
                View on X
              </button>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="flex gap-3 items-start p-4 rounded-lg border border-[color-mix(in_srgb,var(--down),transparent_72%)] bg-[color-mix(in_srgb,var(--down),transparent_94%)] text-[var(--down)] text-sm shadow-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="m-0 font-medium">{error}</p>
          </div>
        )}

        {/* Loading Skeletal State */}
        {isInitialLoading && (
          <div className="flex flex-col gap-6">
            <div className="w-full h-[240px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] animate-pulse opacity-60" />
            <div className="w-full h-[400px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] animate-pulse opacity-60" />
          </div>
        )}

        {/* Main Tweet Intel and Thread */}
        {activeTweetId && !isInitialLoading && !error && (
          <>
            {/* Main Tweet Card */}
            {mainTweet ? (
              <div className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
                <div className="p-6 sm:p-4">
                  {/* User Profile Info */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {mainTweet.avatar ? (
                        <div className="w-12 h-12 p-[2px] rounded-full bg-[var(--bg-surface)] border border-[var(--border)] overflow-hidden shrink-0">
                          <img
                            src={mainTweet.avatar}
                            alt={mainTweet.fullname || mainTweet.username}
                            className="w-full h-full rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center font-bold text-[var(--text-muted)] shrink-0">
                          {mainTweet.fullname?.charAt(0) || mainTweet.username?.charAt(1) || "?"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="m-0 text-[17px] font-extrabold leading-snug tracking-tight text-[var(--text-primary)] truncate">
                          {mainTweet.fullname || mainTweet.username}
                        </h2>
                        <p className="m-0 text-xs text-[var(--text-muted)] truncate">
                          {mainTweet.username}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isActionDisabled}
                      onClick={() => !isActionDisabled && toggleBookmark(mainTweet.id, 'tweet')}
                      className={`p-2 rounded-lg border transition-all ${isActionDisabled ? "opacity-50 cursor-not-allowed" : ""
                        } ${bookmarks.has(mainTweet.id)
                          ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                          : "bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
                        }`}
                      title={bookmarks.has(mainTweet.id) ? "Remove Bookmark" : "Bookmark Tweet"}
                    >
                      <Bookmark className={`w-4 h-4 ${bookmarks.has(mainTweet.id) ? "fill-current" : ""}`} />
                    </button>
                  </div>

                  {/* Tweet Text Content */}
                  <p className="mt-5 text-[17px] sm:text-[16px] leading-[1.6] text-[var(--text-primary)] font-normal whitespace-pre-wrap break-words">
                    {formatTweetText(mainTweet.content)}
                  </p>

                  {/* Date/Time */}
                  {mainTweet.date && (
                    <div className="flex items-center gap-1.5 mt-5 text-xs text-[var(--text-muted)]">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{mainTweet.date}</span>
                    </div>
                  )}

                  {/* Ingestion Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-[var(--border)]">
                    <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)] text-center sm:p-2">
                      <span className="block text-[var(--text-primary)] text-lg sm:text-xl leading-tight font-extrabold truncate">
                        {formatNumber(mainTweet.stats.comments)}
                      </span>
                      <span className="inline-flex items-center gap-1 mt-1 text-[var(--text-muted)] text-[11px] font-semibold uppercase tracking-wider">
                        <MessageSquare className="w-3 h-3 sm:hidden" />
                        Replies
                      </span>
                    </div>
                    <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)] text-center sm:p-2">
                      <span className="block text-[var(--text-primary)] text-lg sm:text-xl leading-tight font-extrabold truncate">
                        {formatNumber(mainTweet.stats.retweets)}
                      </span>
                      <span className="inline-flex items-center gap-1 mt-1 text-[var(--text-muted)] text-[11px] font-semibold uppercase tracking-wider">
                        <Repeat2 className="w-3 h-3 sm:hidden" />
                        Reposts
                      </span>
                    </div>
                    <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)] text-center sm:p-2">
                      <span className="block text-[var(--text-primary)] text-lg sm:text-xl leading-tight font-extrabold truncate">
                        {formatNumber(mainTweet.stats.hearts)}
                      </span>
                      <span className="inline-flex items-center gap-1 mt-1 text-[var(--text-muted)] text-[11px] font-semibold uppercase tracking-wider">
                        <Heart className="w-3 h-3 sm:hidden" />
                        Likes
                      </span>
                    </div>
                    <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)] text-center sm:p-2">
                      <span className="block text-[var(--text-primary)] text-lg sm:text-xl leading-tight font-extrabold truncate">
                        {mainTweet.stats.views ? formatNumber(mainTweet.stats.views) : "--"}
                      </span>
                      <span className="inline-flex items-center gap-1 mt-1 text-[var(--text-muted)] text-[11px] font-semibold uppercase tracking-wider">
                        <Eye className="w-3 h-3 sm:hidden" />
                        Views
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 text-center text-[var(--text-secondary)]">
                <AlertCircle className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2" />
                <p className="m-0 font-semibold">Could not load main tweet content</p>
                <p className="m-0 text-xs text-[var(--text-muted)] mt-1">
                  Check if Nitter is encountering high rate limits.
                </p>
              </div>
            )}

            {/* Replies Section */}
            <div className="w-full flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mt-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-[16px] font-bold text-[var(--text-primary)] m-0">
                    Replies Thread ({totalReplies})
                  </h3>
                  {mainTweet && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isActionDisabled}
                        onClick={() => {
                          if (isActionDisabled) return;
                          const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ mainTweet, replies }, null, 2));
                          const downloadAnchorNode = document.createElement("a");
                          downloadAnchorNode.setAttribute("href", dataStr);
                          downloadAnchorNode.setAttribute("download", `tweet_${mainTweet.id}_dossier.json`);
                          document.body.appendChild(downloadAnchorNode);
                          downloadAnchorNode.click();
                          downloadAnchorNode.remove();
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed hover:text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_95%)] transition-all cursor-pointer"
                        title="Download Dossier JSON"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download JSON
                      </button>
                      <button
                        type="button"
                        disabled={isActionDisabled}
                        onClick={handleDeleteReplies}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-500/20 bg-[color-mix(in_srgb,red,transparent_98%)] text-red-500 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-500/10 transition-all cursor-pointer text-xs font-semibold"
                        title="Delete Cached Replies"
                      >
                        {isDeletingReplies ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Delete Replies
                      </button>
                    </div>
                  )}
                </div>
                {totalReplies > 0 && (
                  <span className="text-xs font-semibold text-[var(--text-muted)] bg-[var(--bg-subtle)] px-2.5 py-1 rounded-md border border-[var(--border-subtle)]">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
              </div>

              {totalReplies === 0 ? (
                <div className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-8 text-center text-[var(--text-muted)] shadow-sm">
                  <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p className="m-0 text-sm font-semibold">No replies found for this tweet.</p>
                  <p className="m-0 text-xs mt-1">
                    Nitter might not have scraped or returned any replies for this thread.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4 sm:gap-3">
                  {paginatedReplies.map((reply) => (
                    <div
                      key={reply.id}
                      className={`w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 sm:p-4 shadow-sm transition-all ${reply.isUnavailable
                        ? "border-[color-mix(in_srgb,var(--down),transparent_72%)] bg-[color-mix(in_srgb,var(--down),transparent_97%)]"
                        : ""
                        }`}
                    >
                      {reply.isUnavailable ? (
                        <div className="flex items-center gap-2 text-xs font-medium text-[var(--down)]">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{reply.content}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {/* Reply Header */}
                          <div className="flex items-start justify-between gap-3 min-w-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {reply.avatar ? (
                                <div className="w-9 h-9 p-[1px] rounded-full bg-[var(--bg-surface)] border border-[var(--border)] overflow-hidden shrink-0">
                                  <img
                                    src={reply.avatar}
                                    alt={reply.fullname || reply.username}
                                    className="w-full h-full rounded-full object-cover"
                                    onError={(e) => {
                                      e.currentTarget.style.display = "none";
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center font-bold text-xs text-[var(--text-muted)] shrink-0">
                                  {reply.fullname?.charAt(0) || reply.username?.charAt(1) || "?"}
                                </div>
                              )}
                              <div className="min-w-0">
                                <h4 className="m-0 text-sm font-extrabold text-[var(--text-primary)] leading-tight truncate">
                                  {reply.fullname || reply.username}
                                </h4>
                                <p className="m-0 text-[11px] text-[var(--text-muted)] truncate">
                                  {reply.username}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[11px] text-[var(--text-muted)]">
                                {reply.date}
                              </span>
                              <button
                                type="button"
                                disabled={isActionDisabled}
                                onClick={() => !isActionDisabled && toggleBookmark(reply.id, 'reply')}
                                className={`p-1.5 rounded-md border transition-all ${isActionDisabled ? "opacity-50 cursor-not-allowed" : ""
                                  } ${bookmarks.has(reply.id)
                                    ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                                    : "bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
                                  }`}
                                title={bookmarks.has(reply.id) ? "Remove Bookmark" : "Bookmark Reply"}
                              >
                                <Bookmark className={`w-3.5 h-3.5 ${bookmarks.has(reply.id) ? "fill-current" : ""}`} />
                              </button>
                            </div>
                          </div>

                          {/* Replying-to label */}
                          {reply.replyToUsers.length > 0 && (
                            <div className="text-xs text-[var(--text-muted)]">
                              Replying to{" "}
                              {reply.replyToUsers.map((user, idx) => (
                                <span key={user} className="text-[var(--accent)] font-medium">
                                  @{user}
                                  {idx < reply.replyToUsers.length - 1 ? ", " : ""}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Reply Body Content */}
                          <p className="m-0 text-sm leading-[1.5] text-[var(--text-primary)] whitespace-pre-wrap break-words">
                            {formatTweetText(reply.content)}
                          </p>

                          {/* Reply Engagement Footer */}
                          <div className="flex items-center gap-4 mt-1 pt-2.5 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                            <span className="inline-flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors">
                              <MessageSquare className="w-3.5 h-3.5" />
                              {formatNumber(reply.stats.comments)}
                            </span>
                            <span className="inline-flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors">
                              <Repeat2 className="w-3.5 h-3.5" />
                              {formatNumber(reply.stats.retweets)}
                            </span>
                            <span className="inline-flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors">
                              <Heart className="w-3.5 h-3.5" />
                              {formatNumber(reply.stats.hearts)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex justify-between items-center mt-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 shadow-sm">
                      <button
                        onClick={handlePrevPage}
                        disabled={currentPage === 1}
                        className="px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border)] bg-transparent text-[var(--text-primary)] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                      >
                        Previous
                      </button>
                      <span className="text-xs font-semibold text-[var(--text-secondary)]">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={handleNextPage}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border)] bg-transparent text-[var(--text-primary)] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
