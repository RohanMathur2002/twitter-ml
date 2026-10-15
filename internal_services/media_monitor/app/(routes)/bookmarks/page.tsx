"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  BookmarkX,
  Calendar,
  ExternalLink,
  BarChart3,
  Heart,
  Loader2,
  MessageSquare,
  RefreshCw,
  Repeat2,
  Eye,
  User,
  Search,
  X,
} from "lucide-react";
import { fetchProfiles } from "@/app/actions/topics";
import ProfileAutocomplete from "@/components/ProfileAutocomplete";

interface ThreadBookmark {
  id: string;
  root_tweet_id: string;
  type: "tweet" | "reply";
  username: string;
  display_name: string | null;
  profile_image_url: string | null;
  raw_text: string;
  created_at: string;
  likes_count: string;
  retweets_count: string;
  replies_count: string;
  views_count: string | null;
}

interface ProfileBookmark {
  id: string;
  username: string;
  bookmarked_at: string;
  raw_text: string | null;
  created_at: string;
  likes_count: string;
  retweets_count: string;
  replies_count: string;
  views_count: string | null;
  is_retweet: boolean;
}

interface DbProfileShort {
  id: number;
  username: string;
  display_name: string | null;
  profile_image_url: string | null;
  followers_count: string;
}

function formatNumber(value: string | number | null | undefined) {
  if (!value) return "0";
  const num = Number(String(value).replace(/[^\d]/g, ""));
  return isNaN(num) ? "0" : num.toLocaleString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function BookmarksPage() {
  const router = useRouter();
  const [threadBookmarks, setThreadBookmarks] = useState<ThreadBookmark[]>([]);
  const [profileBookmarks, setProfileBookmarks] = useState<ProfileBookmark[]>([]);
  const [profiles, setProfiles] = useState<DbProfileShort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"profile" | "thread">("profile");

  // Search / filter states
  const [threadSearch, setThreadSearch] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [profileFilterUsername, setProfileFilterUsername] = useState("");

  const loadBookmarks = async () => {
    setLoading(true);
    setError(null);
    try {
      const [bRes, profilesData] = await Promise.all([
        fetch("/api/bookmarks"),
        fetchProfiles(),
      ]);
      if (!bRes.ok) throw new Error("Failed to load bookmarks");
      const data = await bRes.json();
      setThreadBookmarks(data.threadBookmarks || []);
      setProfileBookmarks(data.profileBookmarks || []);
      setProfiles((profilesData as any[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bookmarks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookmarks();
  }, []);

  const removeThreadBookmark = async (tweetId: string) => {
    setRemovingIds((prev) => new Set(prev).add(tweetId));
    try {
      await fetch("/api/tweet/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweetId, action: "remove" }),
      });
      setThreadBookmarks((prev) => prev.filter((b) => b.id !== tweetId));
    } catch (e) {
      console.error("Failed to remove bookmark", e);
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(tweetId);
        return next;
      });
    }
  };

  const removeProfileBookmark = async (tweetId: string) => {
    setRemovingIds((prev) => new Set(prev).add(tweetId));
    try {
      await fetch("/api/tweet/profile-bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweetId, action: "remove" }),
      });
      setProfileBookmarks((prev) => prev.filter((b) => b.id !== tweetId));
    } catch (e) {
      console.error("Failed to remove profile bookmark", e);
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(tweetId);
        return next;
      });
    }
  };

  // Filtered lists
  const filteredThreadBookmarks = threadBookmarks.filter((bm) => {
    const q = threadSearch.toLowerCase();
    if (!q) return true;
    return (
      bm.raw_text?.toLowerCase().includes(q) ||
      bm.username.toLowerCase().includes(q) ||
      bm.display_name?.toLowerCase().includes(q)
    );
  });

  const filteredProfileBookmarks = profileBookmarks.filter((bm) => {
    const matchesText = profileSearch
      ? bm.raw_text?.toLowerCase().includes(profileSearch.toLowerCase()) ||
        bm.username.toLowerCase().includes(profileSearch.toLowerCase())
      : true;
    const matchesUsername = profileFilterUsername
      ? bm.username.toLowerCase().includes(profileFilterUsername.toLowerCase().replace(/^@/, ""))
      : true;
    return matchesText && matchesUsername;
  });

  // Profile avatar lookup for profile bookmarks
  const profileMap = new Map(profiles.map((p) => [p.username.toLowerCase(), p]));

  return (
    <div className="w-full flex justify-center pt-24 pb-20 px-6 sm:pt-12 sm:pb-10 sm:px-4 bg-[var(--bg-base)] min-h-[calc(100vh-56px)] text-[var(--text-primary)] font-sans">
      <div className="w-full max-w-[960px] mx-auto flex flex-col gap-8">

        {/* ── Header (Maps/Topics style) ── */}
        <div className="flex justify-between items-center gap-4 border-b border-[var(--border)] pb-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight m-0 text-[var(--text-primary)]">
              Bookmarks
            </h1>
            <p className="text-sm text-[var(--text-secondary)] m-0">
              Saved tweets from profile analysis and tweet thread dossiers.
            </p>
          </div>
          <button
            onClick={loadBookmarks}
            disabled={loading}
            className="min-h-[38px] px-4 border border-[var(--border)] rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] text-[13px] font-semibold cursor-pointer inline-flex items-center justify-center gap-2 transition-all duration-150 hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* ── Tab bar + Search (Topics-style pill bar) ── */}
        <div className="flex flex-wrap justify-between items-center gap-4 bg-white/5 border border-[var(--border)] rounded-xl py-4 px-5 backdrop-blur-md">
          {/* Tabs — Profile left, Thread right */}
          <div className="flex gap-1.5 bg-[var(--bg-subtle)] p-1 rounded-lg">
            {(["profile", "thread"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-md py-1.5 px-4 text-[13px] font-semibold cursor-pointer transition-all duration-150 ${
                  activeTab === tab
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                    : "bg-transparent text-[var(--text-secondary)] border border-transparent shadow-none hover:text-[var(--text-primary)]"
                }`}
              >
                {tab === "profile" ? "Profile Tweets" : "Tweets with Replies"}
                {tab === "profile" && profileBookmarks.length > 0 && (
                  <span className="ml-1.5 text-[10px] font-bold bg-[var(--accent)]/15 text-[var(--accent)] px-1.5 py-0.5 rounded-full">
                    {profileBookmarks.length}
                  </span>
                )}
                {tab === "thread" && threadBookmarks.length > 0 && (
                  <span className="ml-1.5 text-[10px] font-bold bg-[var(--accent)]/15 text-[var(--accent)] px-1.5 py-0.5 rounded-full">
                    {threadBookmarks.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search box — thread tab */}
          {activeTab === "thread" && (
            <div className="relative w-full max-w-[320px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
                <Search size={14} />
              </span>
              <input
                type="text"
                value={threadSearch}
                onChange={(e) => setThreadSearch(e.target.value)}
                placeholder="Search saved tweets..."
                className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg py-2 pr-8 pl-9 text-sm w-full outline-none transition-colors duration-150 focus:border-[var(--accent)]"
              />
              {threadSearch && (
                <button
                  onClick={() => setThreadSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer bg-transparent border-none p-0"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}

          {/* Profile tab: profile autocomplete filter */}
          {activeTab === "profile" && (
            <div className="flex items-center gap-2 w-full max-w-[380px]">
              <ProfileAutocomplete
                profiles={profiles}
                value={profileFilterUsername}
                onChange={(val) => setProfileFilterUsername(val)}
                onSelect={(username) => setProfileFilterUsername(username)}
                placeholder="Filter by profile..."
                className="flex-1"
              />
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  value={profileSearch}
                  onChange={(e) => setProfileSearch(e.target.value)}
                  placeholder="Search text..."
                  className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg py-2 pr-8 pl-9 text-sm w-full outline-none transition-colors duration-150 focus:border-[var(--accent)]"
                />
                {profileSearch && (
                  <button
                    onClick={() => setProfileSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer bg-transparent border-none p-0"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-500/5 border border-red-500/15 rounded-xl py-4 px-5 text-red-400 text-sm flex items-center gap-3">
            <span>{error}</span>
          </div>
        )}

        {/* ── Loading skeletons ── */}
        {loading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-full h-[130px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] animate-pulse opacity-60"
              />
            ))}
          </div>
        )}

        {/* ══ PROFILE BOOKMARKS TAB ══ */}
        {!loading && activeTab === "profile" && (
          <>
            {filteredProfileBookmarks.length === 0 ? (
              <div className="bg-[var(--bg-surface)] border border-dashed border-[var(--border)] rounded-2xl py-16 px-10 text-center flex flex-col items-center gap-3">
                <Bookmark size={32} className="text-[var(--text-muted)] opacity-40" />
                <span className="text-base font-semibold">
                  {profileBookmarks.length === 0
                    ? "No profile tweet bookmarks yet"
                    : "No results match your filters"}
                </span>
                <span className="text-[13px] text-[var(--text-muted)] max-w-[380px]">
                  {profileBookmarks.length === 0
                    ? "Bookmark tweets from the Profile page and they'll appear here."
                    : "Try clearing your search or profile filter."}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredProfileBookmarks.map((bm) => {
                  const authorProfile = profileMap.get(bm.username.toLowerCase());
                  return (
                    <div
                      key={bm.id}
                      className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:border-[var(--accent)]/30"
                    >
                      {/* Author header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {authorProfile?.profile_image_url ? (
                            <img
                              src={authorProfile.profile_image_url}
                              alt={bm.username}
                              className="w-9 h-9 rounded-full object-cover border border-[var(--border)] shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center shrink-0">
                              <User size={14} className="text-[var(--text-muted)]" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="m-0 text-sm font-extrabold text-[var(--text-primary)] truncate">
                              {authorProfile?.display_name || bm.username}
                            </p>
                            <p className="m-0 text-xs text-[var(--text-muted)]">@{bm.username}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() =>
                              router.push(`/tweet?id=${bm.id}&username=${bm.username}`)
                            }
                            className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all cursor-pointer"
                            title="Open in analysis page"
                          >
                            <BarChart3 size={12} />
                          </button>
                          <a
                            href={`https://x.com/${bm.username}/status/${bm.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all cursor-pointer inline-flex items-center justify-center"
                            title="Open in X"
                          >
                            <ExternalLink size={12} />
                          </a>
                          <button
                            onClick={() => removeProfileBookmark(bm.id)}
                            disabled={removingIds.has(bm.id)}
                            className="p-1.5 rounded-md border border-red-500/20 bg-transparent text-red-500 hover:bg-red-500/10 transition-all cursor-pointer disabled:opacity-50"
                            title="Remove Bookmark"
                          >
                            {removingIds.has(bm.id) ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <BookmarkX size={12} />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Tweet text */}
                      <p className="m-0 text-[14px] leading-[1.65] text-[var(--text-primary)] whitespace-pre-wrap break-words line-clamp-5">
                        {bm.raw_text || (
                          <span className="italic text-[var(--text-muted)]">
                            Tweet content unavailable
                          </span>
                        )}
                      </p>

                      {/* Footer stats */}
                      <div className="flex items-center gap-4 pt-2.5 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                        {bm.created_at && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar size={11} />
                            {formatDate(bm.created_at)}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare size={11} />
                          {formatNumber(bm.replies_count)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Repeat2 size={11} />
                          {formatNumber(bm.retweets_count)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Heart size={11} />
                          {formatNumber(bm.likes_count)}
                        </span>
                        {bm.views_count && (
                          <span className="inline-flex items-center gap-1 ml-auto">
                            <Eye size={11} />
                            {formatNumber(bm.views_count)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══ THREAD BOOKMARKS TAB ══ */}
        {!loading && activeTab === "thread" && (
          <>
            {filteredThreadBookmarks.length === 0 ? (
              <div className="bg-[var(--bg-surface)] border border-dashed border-[var(--border)] rounded-2xl py-16 px-10 text-center flex flex-col items-center gap-3">
                <Bookmark size={32} className="text-[var(--text-muted)] opacity-40" />
                <span className="text-base font-semibold">
                  {threadBookmarks.length === 0
                    ? "No tweet thread bookmarks yet"
                    : "No results match your search"}
                </span>
                <span className="text-[13px] text-[var(--text-muted)] max-w-[380px]">
                  {threadBookmarks.length === 0
                    ? "Bookmark tweets from the Tweet page and they'll appear here."
                    : "Try a different search term."}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredThreadBookmarks.map((bm) => (
                  <div
                    key={bm.id}
                    className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:border-[var(--accent)]/30"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {bm.profile_image_url ? (
                          <img
                            src={bm.profile_image_url}
                            alt={bm.username}
                            className="w-9 h-9 rounded-full object-cover border border-[var(--border)] shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center shrink-0">
                            <User size={14} className="text-[var(--text-muted)]" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="m-0 text-sm font-extrabold text-[var(--text-primary)] truncate">
                            {bm.display_name || bm.username}
                          </p>
                          <p className="m-0 text-xs text-[var(--text-muted)]">@{bm.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() =>
                            router.push(
                              `/tweet?id=${bm.root_tweet_id}&username=${bm.username}`
                            )
                          }
                          className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all cursor-pointer"
                          title="Open in analysis page"
                        >
                          <BarChart3 size={12} />
                        </button>
                        <a
                          href={`https://x.com/${bm.username}/status/${bm.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all cursor-pointer inline-flex items-center justify-center"
                          title="Open in X"
                        >
                          <ExternalLink size={12} />
                        </a>
                        <button
                          onClick={() => removeThreadBookmark(bm.id)}
                          disabled={removingIds.has(bm.id)}
                          className="p-1.5 rounded-md border border-red-500/20 bg-transparent text-red-500 hover:bg-red-500/10 transition-all cursor-pointer disabled:opacity-50"
                          title="Remove Bookmark"
                        >
                          {removingIds.has(bm.id) ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <BookmarkX size={12} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Tweet text */}
                    <p className="m-0 text-[14px] leading-[1.65] text-[var(--text-primary)] whitespace-pre-wrap break-words line-clamp-5">
                      {bm.raw_text}
                    </p>

                    {/* Footer stats */}
                    <div className="flex items-center gap-4 pt-2.5 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={11} />
                        {formatDate(bm.created_at)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare size={11} />
                        {formatNumber(bm.replies_count)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Repeat2 size={11} />
                        {formatNumber(bm.retweets_count)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Heart size={11} />
                        {formatNumber(bm.likes_count)}
                      </span>
                      {bm.views_count && (
                        <span className="inline-flex items-center gap-1 ml-auto">
                          <Eye size={11} />
                          {formatNumber(bm.views_count)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
