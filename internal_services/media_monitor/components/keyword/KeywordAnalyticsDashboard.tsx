"use client";

import { useState, useEffect, FormEvent } from "react";
import {
  AlertCircle,
  Calendar,
  ExternalLink,
  Hash,
  Heart,
  Loader2,
  MessageSquare,
  Repeat2,
  Search,
  TrendingUp,
  Users,
  Eye,
  ArrowRight,
  RefreshCw,
  Database,
  CloudDownload,
} from "lucide-react";
import Link from "next/link";
import { KeywordTimelineChart } from "./KeywordTimelineChart";
import { EngagementDistributionChart } from "./EngagementDistributionChart";
import { TopMentionsList } from "./TopMentionsList";
import { getFlagEmoji } from "@/lib/countries";
import { PieChart } from "@/components/ui/PieChart";
import { MapPin } from "lucide-react";

interface KeywordStats {
  total_tweets: number;
  unique_profiles: number;
  total_likes: number;
  total_retweets: number;
  total_replies: number;
  avg_engagement: number;
  first_seen: string | null;
  last_seen: string | null;
}

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

interface KeywordResult {
  keyword: string;
  stats: KeywordStats;
  topHashtags: Array<{ hashtag: string; count: number }>;
  topProfiles: Array<{
    username: string;
    display_name: string | null;
    profile_image_url: string | null;
    tweet_count: number;
    country?: string | null;
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
  topMentions: Array<{
    mention: string;
    count: number;
  }>;
  countryDistribution?: Array<{
    country: string;
    count: number;
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

interface KeywordAnalyticsDashboardProps {
  initialKeyword?: string;
}

export function KeywordAnalyticsDashboard({ initialKeyword = "" }: KeywordAnalyticsDashboardProps) {
  const [searchInput, setSearchInput] = useState(initialKeyword);
  const [activeKeyword, setActiveKeyword] = useState(initialKeyword);

  const [data, setData] = useState<KeywordResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [saveToDb, setSaveToDb] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<{status: string, message: string, error?: string} | null>(null);
  const [searchMode, setSearchMode] = useState<"live" | "db">("live");

  const loadFromDb = async (kw: string, mode: "db" | "live") => {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch(`/api/analyse/keyword?q=${encodeURIComponent(kw)}&page=1&limit=25&mode=${mode}`);
      if (res.ok) {
        const json = (await res.json()) as KeywordResult;
        setData(json);
        setLoading(false);
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleFetchNitter = async (kw: string) => {
    setLoading(true);
    setError("");
    setData(null);
    setJobStatus(null);
    try {
      const res = await fetch(`/api/analyse/keyword-nitter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw, saveToDb, maxResults: 250 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to start Nitter fetch");
      setJobId(json.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error initiating fetch");
      setLoading(false);
    }
  };

  const handleDeleteDb = async () => {
    if (!activeKeyword) return;
    setLoading(true);
    try {
      await fetch(`/api/analyse/keyword?q=${encodeURIComponent(activeKeyword)}`, { method: "DELETE" });
      setData(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/analyse/keyword-nitter?jobId=${jobId}`);
        const status = await res.json();
        setJobStatus(status);
        if (status.status === "completed" || status.status === "error" || status.status === "stopped") {
          clearInterval(interval);
          setJobId(null);
          
          if (status.status === "completed" && saveToDb) {
            await loadFromDb(activeKeyword, "live");
          } else if (status.status === "completed" && !saveToDb) {
            setError("Analysis finished, but not saved to DB. Check 'Save to database' to view full charts.");
            setLoading(false);
          } else {
            setError(status.error || status.message || "Job stopped");
            setLoading(false);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId, saveToDb, activeKeyword]);

  const handleSearchSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (!trimmed) return;
    setActiveKeyword(trimmed);
    setPage(1);
    
    if (searchMode === "db") {
      const foundInDb = await loadFromDb(trimmed, "db");
      if (!foundInDb) {
        setError("No data found in DB. Try switching to Live Nitter Search.");
      }
    } else {
      await handleFetchNitter(trimmed);
    }
  };

  useEffect(() => {
    if (activeKeyword) {
      if (searchMode === "db") {
        loadFromDb(activeKeyword, "db").then((found) => {
          if (!found) setError("No data found in DB. Try switching to Live Nitter Search.");
        });
      } else {
        loadFromDb(activeKeyword, "live").then((found) => {
          if (!found) handleFetchNitter(activeKeyword);
        });
      }
    }
  }, [initialKeyword, searchMode, activeKeyword]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Unified Header & Search */}
      <div className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl overflow-hidden mb-2 shadow-sm">
        <div className="p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex flex-col gap-1 min-w-0">
              {data ? (
                <div className="flex flex-col gap-1">
                  <h3 className="m-0 text-2xl sm:text-[22px] leading-[1.15] font-extrabold tracking-normal text-[var(--text-primary)]">
                    #{data.keyword}
                  </h3>
                  <div className="flex items-center gap-4 text-[13px] text-[var(--text-secondary)] mt-1 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      First seen: {formatDate(data.stats.first_seen)}
                    </span>
                    <span className="text-[var(--border)]">•</span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Last seen: {formatDate(data.stats.last_seen)}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="m-0 text-2xl sm:text-[22px] leading-[1.15] font-extrabold tracking-normal text-[var(--text-primary)]">
                    Keyword Analysis
                  </h2>
                  <p className="mt-1 text-[var(--text-muted)] text-sm">
                    Analyze keyword engagement, timeline, and associated data.
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-col md:flex-row items-end md:items-center gap-4 w-full md:w-auto">
              {/* Search Mode Selection Toggle */}
              <div className="flex items-center gap-2">
                <div className="flex items-center p-1 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSearchMode("live")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                      searchMode === "live"
                        ? "bg-[#5b9ff6] text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <CloudDownload className="w-4 h-4" />
                    Live Nitter Search
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode("db")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                      searchMode === "db"
                        ? "bg-[#5b9ff6] text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <Database className="w-4 h-4" />
                    Saved DB Data
                    {data && searchMode === "db" && (
                      <span className="bg-white/25 text-white px-1.5 py-0.5 rounded-md text-[11px] ml-1">
                        {formatNumber(data.stats.total_tweets)}
                      </span>
                    )}
                  </button>
                </div>
                {searchMode === "live" && (
                  <label className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] ml-2 cursor-pointer hover:text-[var(--text-primary)] transition-colors">
                    <input
                      type="checkbox"
                      checked={saveToDb}
                      onChange={(e) => setSaveToDb(e.target.checked)}
                      className="rounded border-[var(--border)] cursor-pointer"
                    />
                    Save to DB
                  </label>
                )}
              </div>

              <form onSubmit={handleSearchSubmit} className="flex items-center gap-3 w-full md:w-auto md:min-w-[280px]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Enter keyword..."
                    className="w-full pl-10 pr-4 py-2 text-[14px] bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-all"
                  />
                </div>
                <button
                  type="submit"
                  className="py-2 px-5 text-[14px] font-semibold bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] rounded-xl transition-all cursor-pointer whitespace-nowrap shadow-sm"
                >
                  Analyze
                </button>
              </form>
            </div>
          </div>

          {jobStatus && jobStatus.status !== "completed" && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl gap-4 mt-6">
              <Loader2 className="w-8 h-8 animate-spin text-[#5b9ff6]" />
              <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">
                {jobStatus.message}
              </h3>
              {jobStatus.error && (
                 <p className="text-red-500 text-sm">{jobStatus.error}</p>
              )}
            </div>
          )}

          {data && (
            <div className="flex flex-col md:flex-row justify-end items-start md:items-center mt-6 pt-4 border-t border-[var(--border)] gap-4">

              <button
                type="button"
                onClick={handleDeleteDb}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all"
              >
                Remove from Database
              </button>
            </div>
          )}

          {data && data.stats.total_tweets === 0 && !jobStatus && (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl gap-4 mt-6">
              <Database className="w-8 h-8 text-[var(--text-muted)]" />
              <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">
                No data found in DB
              </h3>
              <p className="text-[14px] text-[var(--text-secondary)]">
                Try switching to Live Nitter Search to fetch fresh tweets.
              </p>
            </div>
          )}

          {data && data.stats.total_tweets > 0 && !jobStatus && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-6">
              <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]">
                <span className="block text-[var(--text-primary)] text-lg leading-[1.2] font-extrabold">{formatNumber(data.stats.total_tweets)}</span>
                <span className="block mt-1 text-[var(--text-muted)] text-xs">Total Mentions</span>
              </div>
              <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]">
                <span className="block text-[var(--text-primary)] text-lg leading-[1.2] font-extrabold">{formatNumber(data.stats.unique_profiles)}</span>
                <span className="block mt-1 text-[var(--text-muted)] text-xs">Unique Profiles</span>
              </div>
              <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]">
                <span className="block text-[var(--text-primary)] text-lg leading-[1.2] font-extrabold">{formatNumber(data.stats.total_likes + data.stats.total_retweets + data.stats.total_replies)}</span>
                <span className="block mt-1 text-[var(--text-muted)] text-xs">Total Engagement</span>
              </div>
              <div className="p-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-subtle)]">
                <span className="block text-[var(--text-primary)] text-lg leading-[1.2] font-extrabold">{data.stats.avg_engagement}</span>
                <span className="block mt-1 text-[var(--text-muted)] text-xs">Avg Engagement</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {!activeKeyword && !loading && (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl gap-4">
          <div className="w-14 h-14 rounded-full bg-[var(--bg-muted)] flex items-center justify-center text-[var(--text-muted)]">
            <Hash className="w-7 h-7" />
          </div>
          <h3 className="text-[18px] font-semibold text-[var(--text-primary)]">
            No keyword selected
          </h3>
          <p className="text-[14px] text-[var(--text-secondary)] max-w-[440px]">
            Enter a keyword or hashtag above to analyze aggregated engagement metrics.
          </p>
        </div>
      )}

      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
          <span className="text-[14px] text-[var(--text-secondary)] font-medium">
            Analyzing &quot;{activeKeyword}&quot;...
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-500 p-4 rounded-xl text-[14px]">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {data && data.stats.total_tweets > 0 && (
        <div className="flex flex-col gap-8">

          {/* Keyword Timeline Chart */}
          <KeywordTimelineChart keyword={data.keyword} />

          {/* Secondary Charts row */}
          <div className={`grid grid-cols-1 gap-6 ${data.countryDistribution && data.countryDistribution.length > 0 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
            <EngagementDistributionChart 
              likes={data.stats.total_likes}
              retweets={data.stats.total_retweets}
              replies={data.stats.total_replies}
            />
            <TopMentionsList mentions={data.topMentions || []} />
            {data.countryDistribution && data.countryDistribution.length > 0 && (
              <PieChart 
                title="Country Distribution"
                icon={<MapPin className="w-5 h-5 text-[var(--text-muted)]" />}
                data={data.countryDistribution.map(c => ({
                  label: c.country,
                  value: c.count,
                  icon: getFlagEmoji(c.country)
                }))}
              />
            )}
          </div>

          {/* Top Profiles & Co-occurring Hashtags */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] p-6 rounded-xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[16px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[var(--text-muted)]" />
                  Top Active Profiles
                </h4>
                <span className="text-[12px] text-[var(--text-secondary)]">Most vocal accounts</span>
              </div>

              {data.topProfiles.length === 0 ? (
                <div className="text-[13px] text-[var(--text-muted)] py-6 text-center">
                  No account breakdown available.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {data.topProfiles.map((p) => (
                    <div
                      key={p.username}
                      className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]/50 hover:border-[var(--border)] transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] flex items-center justify-center text-[13px] font-bold uppercase overflow-hidden shrink-0">
                          {p.profile_image_url ? (
                            <img
                              src={p.profile_image_url}
                              alt={p.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            p.username.slice(0, 2)
                          )}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/profile?username=${p.username}`}
                              className="text-[14px] font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] no-underline"
                            >
                              {p.display_name || `@${p.username}`}
                            </Link>
                            {p.country && (
                              <span title={p.country} className="text-[14px]">
                                {getFlagEmoji(p.country)}
                              </span>
                            )}
                          </div>
                          <span className="text-[12px] text-[var(--text-secondary)]">
                            @{p.username}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)]">
                          {p.tweet_count} {p.tweet_count === 1 ? "mention" : "mentions"}
                        </span>
                        <Link
                          href={`/profile?username=${p.username}`}
                          className="text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                          title="Inspect Profile"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[var(--bg-surface)] border border-[var(--border)] p-6 rounded-xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[16px] font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Hash className="w-4 h-4 text-[var(--text-muted)]" />
                  Co-occurring Hashtags
                </h4>
                <span className="text-[12px] text-[var(--text-secondary)]">Click to explore</span>
              </div>

              {data.topHashtags.length === 0 ? (
                <div className="text-[13px] text-[var(--text-muted)] py-6 text-center">
                  No co-occurring hashtags found.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  {data.topHashtags.map((h) => (
                    <button
                      key={h.hashtag}
                      onClick={() => {
                        const nextKw = h.hashtag.startsWith("#") ? h.hashtag : `#${h.hashtag}`;
                        setActiveKeyword(nextKw);
                        setSearchInput(nextKw);
                        setPage(1);
                        if (searchMode === "db") {
                          loadFromDb(nextKw, "db").then((found) => {
                            if (!found) setError("No data found in DB. Try switching to Live Nitter Search.");
                          });
                        } else {
                          handleFetchNitter(nextKw);
                        }
                      }}
                      className="flex items-center gap-2 py-2 px-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all cursor-pointer group"
                    >
                      <span className="text-[13px] font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                        {h.hashtag.startsWith("#") ? h.hashtag : `#${h.hashtag}`}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                        {formatNumber(h.count)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Country Distribution */}
          {data.countryDistribution && (
            <PieChart 
              title="Country Distribution"
              icon={<MapPin className="w-5 h-5 text-[var(--text-muted)]" />}
              data={data.countryDistribution.map(c => ({
                label: c.country,
                value: c.count,
                icon: getFlagEmoji(c.country)
              }))}
            />
          )}

          {/* Top Tweets Section */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] p-6 rounded-xl flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <h4 className="text-[17px] font-bold text-[var(--text-primary)]">
                  Discourse Mentions
                </h4>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  Showing {data.tweets.length} of {formatNumber(data.total)} matching tweets
                </p>
              </div>
            </div>

            {data.tweets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <MessageSquare className="w-8 h-8 text-[var(--text-muted)]" />
                <span className="text-[14px] text-[var(--text-secondary)]">
                  No tweets found containing &quot;{data.keyword}&quot;.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {data.tweets.map((t) => (
                  <div
                    key={t.id}
                    className="p-5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] flex flex-col gap-3 hover:border-[var(--accent)]/40 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[13px] font-semibold text-[var(--text-secondary)]">
                          {formatDate(t.created_at)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {t.is_retweet && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            <Repeat2 className="w-3 h-3" /> RT
                          </span>
                        )}
                        <Link
                          href={`/tweet?id=${t.id}`}
                          className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--bg-surface)] transition-all"
                          title="View Thread Analysis"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>

                    <p className="text-[14px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
                      {t.clean_text || t.raw_text}
                    </p>

                    <div className="flex items-center gap-6 pt-2 border-t border-[var(--border)]/60 text-[13px] text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1.5">
                        <Heart className="w-4 h-4 text-rose-500" />
                        {formatNumber(t.likes_count)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Repeat2 className="w-4 h-4 text-emerald-500" />
                        {formatNumber(t.retweets_count)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MessageSquare className="w-4 h-4 text-sky-500" />
                        {formatNumber(t.replies_count)}
                      </span>
                      {t.views_count && (
                        <span className="flex items-center gap-1.5">
                          <Eye className="w-4 h-4 text-amber-500" />
                          {formatNumber(t.views_count)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="py-2 px-4 rounded-lg border border-[var(--border)] text-[13px] font-medium text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed hover:border-[var(--accent)] transition-all cursor-pointer"
                >
                  Previous
                </button>
                <span className="text-[13px] text-[var(--text-secondary)]">
                  Page <strong className="text-[var(--text-primary)]">{page}</strong> of{" "}
                  <strong className="text-[var(--text-primary)]">{totalPages}</strong>
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="py-2 px-4 rounded-lg border border-[var(--border)] text-[13px] font-medium text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed hover:border-[var(--accent)] transition-all cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
