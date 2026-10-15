"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertCircle, BarChart3, Calendar, Download, Hash, Loader2, MessageSquare, Repeat2, Search, ThumbsUp, X } from "lucide-react";
import styles from "@/components/nitter/Nitter.module.css";

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
    <Suspense fallback={<div className={styles.loadingStack}><Loader2 className={styles.spin} /></div>}>
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
  const [reprocessing, setReprocessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAttachments, setShowAttachments] = useState(false);
  const [similarityQuery, setSimilarityQuery] = useState("");
  const [similarityLoading, setSimilarityLoading] = useState(false);
  const [similarityResults, setSimilarityResults] = useState<SimilarTweetResult[]>([]);
  const [similarityError, setSimilarityError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

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

  const loadFromDb = async (targetUsername: string, nextPage = 1) => {
    const cleanUsername = targetUsername.replace("@", "").trim();
    if (!cleanUsername) return;

    setLoading(true);
    setError(null);

    try {
      const [profileRes, statsRes, tweetsRes] = await Promise.all([
        fetch(`/api/analyse/profile?username=${encodeURIComponent(cleanUsername)}`),
        fetch(`/api/analyse/stats?username=${encodeURIComponent(cleanUsername)}`),
        fetch(
          `/api/analyse/tweets?username=${encodeURIComponent(cleanUsername)}&page=${nextPage}&limit=${PAGE_SIZE}`
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
    setError(null);

    let lastError = "";

    for (let attempt = 1; attempt <= MAX_FETCH_RETRIES; attempt++) {
      try {
        const response = await fetch("/api/analyse/fetch-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: cleanUsername }),
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

  const handleFetchReplies = async () => {
    const cleanUsername = username.replace("@", "").trim();
    if (!cleanUsername) return;

    setIngesting(true);
    setIngestingTarget(cleanUsername);
    setIngestProgress(0);
    setError(null);

    try {
      const response = await fetch("/api/analyse/fetch-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername }),
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
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.panel}>
          <form onSubmit={handleSearch} className={styles.searchForm}>
            <div className={styles.searchField}>
              <div className={styles.searchIcon}>
                <Search />
              </div>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter username (e.g. DrNimoYadav)"
                className={styles.searchInput}
              />
            </div>
            <button
              type="submit"
              disabled={loading || ingesting || !username.trim()}
              className={styles.searchButton}
            >
              {loading ? <Loader2 className={styles.spin} /> : "Search DB"}
            </button>
          </form>

          <div className={styles.actionsRow}>
            <button
              type="button"
              disabled={ingesting || loading || reprocessing || !username.trim()}
              className={styles.fetchUserButton}
              onClick={handleFetchUser}
            >
              {ingesting ? (
                <>
                  <Loader2 className={styles.spin} />
                  Fetching User
                </>
              ) : (
                "Fetch User"
              )}
            </button>

            <button
              type="button"
              disabled={ingesting || loading || reprocessing || !username.trim()}
              className={styles.fetchUserButton}
              onClick={handleFetchReplies}
            >
              {ingesting ? (
                <>
                  <Loader2 className={styles.spin} />
                  Fetching Replies
                </>
              ) : (
                "Fetch Replies"
              )}
            </button>

            {profile && (
              <>
                <button
                  type="button"
                  disabled={ingesting || loading || reprocessing}
                  className={styles.fetchUserButton}
                  onClick={handleReprocess}
                >
                  {reprocessing ? (
                    <>
                      <Loader2 className={styles.spin} />
                      Reprocessing
                    </>
                  ) : (
                    "Reprocess DB"
                  )}
                </button>

                <button
                  type="button"
                  disabled={ingesting || loading || reprocessing}
                  className={styles.fetchUserButton}
                  onClick={() => window.open(`/analyse-profile/${activeUsername || username.replace("@", "").trim()}`, "_blank")}
                >
                  Analyse Profile
                </button>
              </>
            )}
          </div>

          {ingesting && ingestProgress !== null && (
            <div className={styles.progressContainer}>
              <div className={styles.progressHeader}>
                <span className={styles.progressLabel}>Fetching Tweets...</span>
                <span className={styles.progressPercentage}>{ingestProgress}%</span>
              </div>
              <div className={styles.progressBarBg}>
                <div 
                  className={styles.progressBarFill} 
                  style={{ width: `${ingestProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className={styles.error}>
            <AlertCircle size={18} />
            <p>{error}</p>
          </div>
        )}

        {profile && (
          <div className={styles.profileCard}>
            <div className={styles.profileBody}>
              <div className={styles.profileTop}>
                {profile.profile_image_url && (
                  <div className={styles.avatarWrap}>
                    <img
                      src={profile.profile_image_url}
                      alt={profile.display_name || profile.username}
                      className={styles.avatar}
                    />
                  </div>
                )}
                <div className={styles.identity}>
                  <h2 className={styles.name}>{profile.display_name || profile.username}</h2>
                  <p className={styles.username}>@{profile.username}</p>
                </div>
              </div>

              {profile.bio && <p className={styles.bio}>{profile.bio}</p>}

              <div className={styles.meta}>
                {profile.location && <span className={styles.metaItem}>{profile.location}</span>}
                <span className={styles.metaItem}>Scraped {formatDate(profile.scraped_at)}</span>
              </div>

              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{formatNumber(profile.tweet_count)}</span>
                  <span className={styles.statLabel}>Tweets</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{formatNumber(profile.followers_count)}</span>
                  <span className={styles.statLabel}>Followers</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{formatNumber(profile.following_count)}</span>
                  <span className={styles.statLabel}>Following</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statValue}>{formatNumber(totalTweets)}</span>
                  <span className={styles.statLabel}>Stored</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {stats && (
          <section className={styles.analyticsGrid}>
            <div className={styles.analyticsCard}>
              <BarChart3 size={18} />
              <span>Total tweets</span>
              <strong>{formatNumber(stats.total_tweets)}</strong>
            </div>
            <div className={styles.analyticsCard}>
              <Hash size={18} />
              <span>Total hashtags</span>
              <strong>{formatNumber(stats.total_hashtags)}</strong>
            </div>
            <div className={styles.analyticsCard}>
              <ThumbsUp size={18} />
              <span>Avg likes</span>
              <strong>{formatNumber(stats.avg_likes)}</strong>
            </div>
            <div className={styles.analyticsCard}>
              <Repeat2 size={18} />
              <span>Retweet ratio</span>
              <strong>{Math.round(Number(stats.retweet_ratio || 0) * 100)}%</strong>
            </div>
            <div className={styles.analyticsWideCard}>
              <strong>Most used hashtags</strong>
              <p>
                {stats.mostUsedHashtags.length
                  ? stats.mostUsedHashtags
                    .map((item) => `#${item.hashtag} (${item.usage_count})`)
                    .join(", ")
                  : "No hashtags stored yet."}
              </p>
            </div>
            <div className={styles.analyticsWideCard}>
              <strong>Language distribution</strong>
              <p>
                {stats.languageDistribution
                  .map((item) => `${item.lang}: ${item.count}`)
                  .join(", ")}
              </p>
            </div>
            <div className={styles.analyticsWideCard}>
              <strong>Most active hours</strong>
              <p>
                {stats.mostActivePostingHours
                  .map((item) => `${item.hour}:00 (${item.count})`)
                  .join(", ")}
              </p>
            </div>
          </section>
        )}

        {loading && !tweets.length && (
          <div className={styles.loadingStack}>
            <div className={styles.skeletonSmall} />
            <div className={styles.skeletonSmall} />
          </div>
        )}

        {!!tweets.length && (
          <div className={styles.timeline}>
            <div style={{
              marginBottom: '1.25rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Tweets Stored in DB: {formatNumber(totalTweets)}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  type="button"
                  disabled={ingesting || loading || reprocessing}
                  className={styles.downloadButton}
                  onClick={handleDownloadJsonl}
                  style={{ minHeight: '32px', height: '32px', padding: '0 12px', fontSize: '12px' }}
                >
                  <Download size={12} />
                  Download JSONL
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
              <form onSubmit={handleSimilaritySearch} className={styles.searchForm}>
                <div className={styles.searchField} style={{ position: 'relative' }}>
                  <div className={styles.searchIcon}>
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
                    placeholder="Semantic search"
                    className={styles.searchInput}
                    style={{ paddingRight: similarityQuery ? '2.5rem' : '1rem' }}
                  />
                  {similarityQuery && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2px',
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={similarityLoading || !similarityQuery.trim()}
                  className={styles.searchButton}
                >
                  {similarityLoading ? <Loader2 className={styles.spin} /> : "Search Similar"}
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
                      <Loader2 className={styles.spin} size={16} />
                      <span>Searching similarity...</span>
                    </div>
                  )}

                  {similarityError && (
                    <div className={styles.error} style={{ margin: 0 }}>
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
                        <article key={result.tweet_id} className={styles.tweetCard} style={{ margin: 0 }}>
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
                            <span className={styles.tweetName}>{result.tweet_id}</span>
                            <span className={styles.tweetMeta}>
                              score {result.score.toFixed(4)} | {result.model_name} | {formatDate(result.embedded_at)}
                            </span>
                          </div>
                          <p className={styles.tweetText}>{result.text}</p>
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
                className={styles.tweetCard}
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
                <div className={styles.tweetHeader}>
                  <div className={styles.tweetAuthor}>
                    {tweet.is_retweet ? (
                      <>
                        <span className={styles.tweetName}>
                          {tweet.raw_tweet_json?.fullname || "Original Author"}
                        </span>
                        <span className={styles.tweetMeta}>
                          {tweet.raw_tweet_json?.username || ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={styles.tweetName}>
                          {profile?.display_name || activeUsername}
                        </span>
                        <span className={styles.tweetMeta}>@{activeUsername}</span>
                      </>
                    )}
                    <span className={styles.tweetMeta}>
                      <Calendar size={13} /> {formatDate(tweet.created_at)}
                    </span>
                    <span className={styles.tweetMeta}>{tweet.lang || "und"}</span>
                  </div>
                </div>

                <p className={styles.tweetText}>{tweet.raw_text}</p>

                {!!tweet.hashtags?.length && (
                  <div className={styles.hashtagRow}>
                    {tweet.hashtags.map((hashtag) => (
                      <span key={hashtag}>#{hashtag}</span>
                    ))}
                  </div>
                )}

                {showAttachments && Array.isArray(tweet.media) && tweet.media.length > 0 && (
                  <div className={`${styles.mediaGrid} ${tweet.media.length > 1 ? styles.mediaGridTwo : ""}`}>
                    {tweet.media.map((imgUrl: string, idx: number) => (
                      <img
                        key={idx}
                        src={imgUrl}
                        alt="Tweet attachment"
                        className={styles.mediaImage}
                        loading="lazy"
                      />
                    ))}
                  </div>
                )}

                {tweet.raw_tweet_json?.quote && (
                  <div className={styles.quote}>
                    <div className={styles.quoteHeader}>
                      {tweet.raw_tweet_json.quote.avatar ? (
                        <img
                          src={tweet.raw_tweet_json.quote.avatar}
                          alt={tweet.raw_tweet_json.quote.fullname}
                          className={styles.quoteAvatar}
                        />
                      ) : (
                        <div className={styles.quoteAvatarPlaceholder} />
                      )}
                      <span className={styles.quoteName}>
                        {tweet.raw_tweet_json.quote.fullname}
                      </span>
                      <span className={styles.quoteUser}>
                        {tweet.raw_tweet_json.quote.username}
                      </span>
                      <span className={styles.quoteUser} style={{ marginLeft: "auto", fontSize: "0.75rem" }}>
                        {tweet.raw_tweet_json.quote.date}
                      </span>
                    </div>
                    <p className={styles.quoteText}>{tweet.raw_tweet_json.quote.content}</p>

                    {showAttachments && Array.isArray(tweet.raw_tweet_json.quote.media) && tweet.raw_tweet_json.quote.media.length > 0 && (
                      <div className={`${styles.mediaGrid} ${tweet.raw_tweet_json.quote.media.length > 1 ? styles.mediaGridTwo : ""}`} style={{ marginTop: "8px" }}>
                        {tweet.raw_tweet_json.quote.media.map((imgUrl: string, idx: number) => (
                          <img
                            key={idx}
                            src={imgUrl}
                            alt="Quoted attachment"
                            className={styles.mediaImage}
                            loading="lazy"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className={styles.tweetStats}>
                  <span className={styles.tweetStat}>
                    <MessageSquare size={16} />
                    {formatNumber(tweet.replies_count)}
                  </span>
                  <span className={styles.tweetStat}>
                    <Repeat2 size={16} />
                    {formatNumber(tweet.retweets_count)}
                  </span>
                  <span className={styles.tweetStat}>
                    <ThumbsUp size={16} />
                    {formatNumber(tweet.likes_count)}
                  </span>
                  {tweet.views_count && (
                    <span className={styles.tweetViews}>
                      {formatNumber(tweet.views_count)} views
                    </span>
                  )}
                </div>
              </article>
            ))}

            <div className={styles.pagination}>
              <button
                className={styles.loadMoreButton}
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
                className={styles.loadMoreButton}
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
