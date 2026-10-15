"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, BarChart3, AlertCircle, ThumbsUp, ThumbsDown, MinusCircle, MessageSquareQuote } from "lucide-react";

interface NitterTweet {
  id: string;
  url: string;
  avatar: string;
  fullname: string;
  username: string;
  date: string;
  content: string;
  stats: any;
  media: string[];
  isRetweet: boolean;
  isReply: boolean;
  replyToUsers: string[];
  isUnavailable?: boolean;
}

interface NitterTweetDetails {
  mainTweet: NitterTweet | null;
  replies: NitterTweet[];
}

interface StancePrediction {
  text: string;
  label: "supportive" | "opposition" | "neutral";
  score: number;
}

interface StanceBatchPredictResponse {
  predictions: StancePrediction[];
}

export default function AnalyseTweetAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      }
    >
      <StanceAnalyticsContent />
    </Suspense>
  );
}

function StanceAnalyticsContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mainTweet, setMainTweet] = useState<NitterTweet | null>(null);
  const [predictions, setPredictions] = useState<StancePrediction[]>([]);

  const searchParams = useSearchParams();
  const router = useRouter();

  const urlId = searchParams.get("id") || "";
  const urlUsername = searchParams.get("username") || "";

  useEffect(() => {
    if (!urlId) {
      setError("No tweet ID provided.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    fetchAndAnalyze(urlId, urlUsername, controller.signal);
    return () => {
      controller.abort();
    };
  }, [urlId, urlUsername]);

  const fetchAndAnalyze = async (id: string, username: string, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch tweet details
      const tweetRes = await fetch(`/api/analyse/tweet?id=${id}&username=${username}`, { signal });
      if (!tweetRes.ok) {
        throw new Error("Failed to fetch tweet details");
      }
      const tweetData: NitterTweetDetails = await tweetRes.json();
      
      if (!tweetData.mainTweet) {
        throw new Error("Could not load main tweet for analysis");
      }
      setMainTweet(tweetData.mainTweet);

      const replies = tweetData.replies.filter(r => !r.isUnavailable);
      if (replies.length === 0) {
        setPredictions([]);
        setLoading(false);
        return;
      }

      // 2. Check if predictions are already cached in DB for the replies
      const hasCachedStances = replies.every(r => (r as any).stanceLabel !== null && (r as any).stanceLabel !== undefined);
      if (hasCachedStances) {
        const cachedPredictions: StancePrediction[] = replies.map(r => ({
          text: r.content,
          label: (r as any).stanceLabel as any,
          score: (r as any).stanceScore || 0,
        }));
        setPredictions(cachedPredictions);
        setLoading(false);
        return;
      }

      // 3. Fetch ML stance analysis
      const BATCH_SIZE = 15;
      let allPredictions: StancePrediction[] = [];

      for (let i = 0; i < replies.length; i += BATCH_SIZE) {
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        const batchReplies = replies.slice(i, i + BATCH_SIZE);
        const batchTweets = batchReplies.map(r => ({ id: r.id, text: r.content }));
        const chunkIndex = Math.floor(i / BATCH_SIZE) + 1;
        const totalChunks = Math.ceil(replies.length / BATCH_SIZE);

        const mlRes = await fetch("/api/analyse/tweet/stance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tweets: batchTweets,
            topic_name: "the tweet",
            chunkIndex,
            totalChunks,
          }),
          signal,
        });

        if (!mlRes.ok) {
          throw new Error("ML analysis failed");
        }
        
        const mlData: StanceBatchPredictResponse = await mlRes.json();
        allPredictions = [...allPredictions, ...mlData.predictions];
      }

      setPredictions(allPredictions);

    } catch (err: any) {
      if (err.name === "AbortError" || signal?.aborted) {
        return;
      }
      setError(err instanceof Error ? err.message : "An error occurred during analysis");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  const { supportive, opposition, neutral, total } = useMemo(() => {
    let supportive = 0, opposition = 0, neutral = 0;
    predictions.forEach(p => {
      if (p.label === "supportive") supportive++;
      else if (p.label === "opposition") opposition++;
      else if (p.label === "neutral") neutral++;
    });
    return { supportive, opposition, neutral, total: predictions.length };
  }, [predictions]);

  const supportivePct = total > 0 ? (supportive / total) * 100 : 0;
  const oppositionPct = total > 0 ? (opposition / total) * 100 : 0;
  const neutralPct = total > 0 ? (neutral / total) * 100 : 0;

  return (
    <div className="w-full flex justify-center pt-10 pb-20 px-6 sm:pt-6 sm:pb-10 sm:px-4">
      <div className="w-full max-w-[960px] mx-auto flex flex-col gap-6 sm:gap-4">
        {/* Header Panel */}
        <div className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 sm:p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent),transparent_95%)] transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <h1 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Stance Analytics
            </h1>
          </div>
        </div>

        {error && (
          <div className="flex gap-3 items-start p-4 rounded-lg border border-[color-mix(in_srgb,var(--down),transparent_72%)] bg-[color-mix(in_srgb,var(--down),transparent_94%)] text-[var(--down)] text-sm shadow-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="m-0 font-medium">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="w-full h-[400px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col items-center justify-center text-[var(--text-muted)] shadow-sm">
            <Loader2 className="w-10 h-10 animate-spin text-[var(--accent)] mb-4" />
            <p className="font-semibold text-[var(--text-primary)]">Running ML zero-shot stance analysis...</p>
            <p className="text-xs mt-2 opacity-70">This might take a minute depending on the thread size.</p>
          </div>
        ) : (
          !error && (
            <div className="flex flex-col gap-6 sm:gap-4">
              {/* Analytics Summary Card */}
              <div className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 sm:p-5 shadow-sm">
                <h2 className="text-[17px] font-extrabold text-[var(--text-primary)] leading-snug tracking-tight mb-6">
                  Community Reception
                </h2>

                {total === 0 ? (
                  <div className="text-center text-[var(--text-muted)] py-10">
                    <MessageSquareQuote className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    <p className="font-medium text-sm">Not enough replies to analyze.</p>
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row gap-10 items-center justify-center md:justify-start md:px-10">
                    {/* SVG Donut Chart */}
                    <div className="relative w-40 h-40 shrink-0">
                      <svg viewBox="0 0 36 36" className="w-full h-full">
                        <circle cx="18" cy="18" r="15.91549430918954" fill="transparent" stroke="var(--bg-subtle)" strokeWidth="3" />
                        
                        {/* Supportive */}
                        <circle
                          cx="18" cy="18" r="15.91549430918954"
                          fill="transparent"
                          stroke="var(--up)"
                          strokeWidth="3.5"
                          strokeDasharray={`${supportivePct} ${100 - supportivePct}`}
                          strokeDashoffset="25"
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-out"
                        />
                        {/* Neutral */}
                        <circle
                          cx="18" cy="18" r="15.91549430918954"
                          fill="transparent"
                          stroke="#9ca3af"
                          strokeWidth="3.5"
                          strokeDasharray={`${neutralPct} ${100 - neutralPct}`}
                          strokeDashoffset={25 - supportivePct}
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-out"
                        />
                        {/* Opposition */}
                        <circle
                          cx="18" cy="18" r="15.91549430918954"
                          fill="transparent"
                          stroke="var(--down)"
                          strokeWidth="3.5"
                          strokeDasharray={`${oppositionPct} ${100 - oppositionPct}`}
                          strokeDashoffset={25 - supportivePct - neutralPct}
                          strokeLinecap="round"
                          className="transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-3xl font-extrabold text-[var(--text-primary)]">{total}</span>
                        <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Replies</span>
                      </div>
                    </div>

                    {/* Clean Stats Legend */}
                    <div className="flex flex-col gap-5 w-full max-w-[320px]">
                      {/* Supportive Bar */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <ThumbsUp className="w-4 h-4 text-[var(--up)]" />
                            <span className="font-semibold text-[var(--text-primary)]">Supportive</span>
                          </div>
                          <span className="font-bold text-[var(--text-primary)]">{supportivePct.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                          <div className="h-full bg-[var(--up)] rounded-full" style={{ width: `${supportivePct}%` }} />
                        </div>
                      </div>
                      
                      {/* Neutral Bar */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <MinusCircle className="w-4 h-4 text-[#9ca3af]" />
                            <span className="font-semibold text-[var(--text-primary)]">Neutral</span>
                          </div>
                          <span className="font-bold text-[var(--text-primary)]">{neutralPct.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                          <div className="h-full bg-[#9ca3af] rounded-full" style={{ width: `${neutralPct}%` }} />
                        </div>
                      </div>

                      {/* Opposition Bar */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <ThumbsDown className="w-4 h-4 text-[var(--down)]" />
                            <span className="font-semibold text-[var(--text-primary)]">Opposition</span>
                          </div>
                          <span className="font-bold text-[var(--text-primary)]">{oppositionPct.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                          <div className="h-full bg-[var(--down)] rounded-full" style={{ width: `${oppositionPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Detailed Feedback List */}
              {total > 0 && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mt-2">
                    <h3 className="text-[16px] font-bold text-[var(--text-primary)] m-0 flex items-center gap-2">
                      <MessageSquareQuote className="w-4 h-4 text-[var(--text-muted)]" />
                      Classified Replies
                    </h3>
                    <span className="text-xs font-semibold text-[var(--text-muted)] bg-[var(--bg-subtle)] px-2.5 py-1 rounded-md border border-[var(--border-subtle)]">
                      Top {Math.min(predictions.length, 20)} Samples
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-4 sm:gap-3">
                    {predictions.slice(0, 20).map((p, idx) => {
                      const isSupportive = p.label === 'supportive';
                      const isOpposition = p.label === 'opposition';
                      const isNeutral = p.label === 'neutral';
                      
                      const badgeClasses = isSupportive 
                        ? 'bg-[color-mix(in_srgb,var(--up),transparent_85%)] text-[var(--up)] border-[color-mix(in_srgb,var(--up),transparent_80%)]' 
                        : isOpposition 
                          ? 'bg-[color-mix(in_srgb,var(--down),transparent_85%)] text-[var(--down)] border-[color-mix(in_srgb,var(--down),transparent_80%)]'
                          : 'bg-[var(--bg-subtle)] text-[#9ca3af] border-[var(--border)]';

                      return (
                        <div key={idx} className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 sm:p-4 shadow-sm transition-all hover:border-[var(--border-hover)] flex flex-col gap-3">
                          <div className="flex justify-between items-center gap-4">
                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-bold uppercase tracking-wider ${badgeClasses}`}>
                              {isSupportive && <ThumbsUp className="w-3 h-3" />}
                              {isOpposition && <ThumbsDown className="w-3 h-3" />}
                              {isNeutral && <MinusCircle className="w-3 h-3" />}
                              {p.label}
                            </div>
                            
                            <div className="text-xs text-[var(--text-muted)] font-medium">
                              Confidence: {(p.score * 100).toFixed(0)}%
                            </div>
                          </div>
                          
                          <p className="m-0 text-[15px] sm:text-sm leading-[1.5] text-[var(--text-primary)] whitespace-pre-wrap break-words">
                            {p.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
