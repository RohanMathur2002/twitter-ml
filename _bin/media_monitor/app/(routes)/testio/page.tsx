"use client";

import { useState, useRef } from "react";

interface Tweet {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    impression_count?: number;
  };
  author?: { userName?: string; name?: string };
}

interface ApiResponse {
  tweets?: Tweet[];
  next_cursor?: string;
  has_next_page?: boolean;
  error?: string;
}

export default function TestioPage() {
  const [username, setUsername] = useState("");
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchTweets = async (reset: boolean) => {
    const handle = username.trim().replace(/^@/, "");
    if (!handle) {
      setError("Please enter a username.");
      inputRef.current?.focus();
      return;
    }

    reset ? setLoading(true) : setLoadingMore(true);
    setError("");

    try {
      const params = new URLSearchParams({ username: handle });
      if (!reset && cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/testio?${params.toString()}`);
      const data: ApiResponse = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const incoming = data.tweets ?? [];
      setTweets((prev) => (reset ? incoming : [...prev, ...incoming]));
      setCursor(data.next_cursor);
      setHasMore(!!data.has_next_page && !!data.next_cursor);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCursor(undefined);
    setTweets([]);
    setHasMore(false);
    fetchTweets(true);
  };

  const fmt = (n?: number) =>
    n === undefined ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  const fmtDate = (s?: string) => {
    if (!s) return "";
    const d = new Date(s);
    return isNaN(d.getTime())
      ? s
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <div className="page-container py-12 space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Tweet Explorer</h1>
          <p style={{ color: "var(--text-muted)" }} className="text-sm">
            Powered by twitterapi.io — live tweet search
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSubmit} className="surface p-5 flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <label
              htmlFor="username-input"
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-secondary)" }}
            >
              Twitter Username
            </label>
            <div className="relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm select-none"
                style={{ color: "var(--text-muted)" }}
              >
                @
              </span>
              <input
                id="username-input"
                ref={inputRef}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="mohakmangal"
                autoComplete="off"
                style={{
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  borderRadius: 8,
                  padding: "10px 12px 10px 28px",
                  fontSize: 14,
                  width: "100%",
                  outline: "none",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 22px",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              transition: "opacity 0.15s",
              whiteSpace: "nowrap",
              height: 42,
            }}
          >
            {loading ? "Fetching…" : "Fetch Tweets"}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: 8,
              padding: "12px 16px",
              color: "#f87171",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="surface"
                style={{ padding: 20, opacity: 0.5 }}
              >
                <div
                  style={{
                    height: 12,
                    borderRadius: 6,
                    background: "var(--bg-hover)",
                    marginBottom: 10,
                    width: `${60 + i * 10}%`,
                    animation: "pulse 1.4s ease-in-out infinite",
                  }}
                />
                <div
                  style={{
                    height: 10,
                    borderRadius: 6,
                    background: "var(--bg-hover)",
                    width: "40%",
                    animation: "pulse 1.4s ease-in-out infinite",
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && tweets.length > 0 && (
          <div className="space-y-4">
            <p className="section-title">{tweets.length} tweets fetched</p>

            {tweets.map((tweet) => (
              <article
                key={tweet.id}
                className="surface transition-surface"
                style={{ padding: "18px 20px", cursor: "default" }}
              >
                {/* Author + date row */}
                {(tweet.author || tweet.created_at) && (
                  <div
                    className="flex items-center gap-2 mb-3"
                    style={{ fontSize: 13, color: "var(--text-muted)" }}
                  >
                    {tweet.author?.name && (
                      <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                        {tweet.author.name}
                      </span>
                    )}
                    {tweet.author?.userName && (
                      <span>@{tweet.author.userName}</span>
                    )}
                    {tweet.created_at && (
                      <>
                        <span>·</span>
                        <span>{fmtDate(tweet.created_at)}</span>
                      </>
                    )}
                  </div>
                )}

                {/* Tweet text */}
                <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 14, whiteSpace: "pre-wrap" }}>
                  {tweet.text}
                </p>

                {/* Metrics + ID row */}
                <div
                  className="flex flex-wrap items-center gap-5"
                  style={{ fontSize: 12, color: "var(--text-muted)" }}
                >
                  {tweet.public_metrics && (
                    <>
                      <span title="Likes">♥ {fmt(tweet.public_metrics.like_count)}</span>
                      <span title="Retweets">↻ {fmt(tweet.public_metrics.retweet_count)}</span>
                      <span title="Replies">💬 {fmt(tweet.public_metrics.reply_count)}</span>
                      {tweet.public_metrics.impression_count !== undefined && (
                        <span title="Impressions">👁 {fmt(tweet.public_metrics.impression_count)}</span>
                      )}
                    </>
                  )}
                  <span
                    className="chip"
                    style={{ marginLeft: "auto", fontFamily: "monospace", letterSpacing: 0 }}
                  >
                    ID: {tweet.id}
                  </span>
                </div>
              </article>
            ))}

            {/* Load more */}
            {hasMore && (
              <button
                onClick={() => fetchTweets(false)}
                disabled={loadingMore}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "var(--accent)",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loadingMore ? "not-allowed" : "pointer",
                  opacity: loadingMore ? 0.6 : 1,
                  transition: "opacity 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => ((e.target as HTMLButtonElement).style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => ((e.target as HTMLButtonElement).style.background = "var(--bg-surface)")}
              >
                {loadingMore ? "Loading more…" : "Load more tweets"}
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && tweets.length === 0 && !error && (
          <div
            className="surface"
            style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}
          >
            Enter a username above and click <strong>Fetch Tweets</strong>.
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
