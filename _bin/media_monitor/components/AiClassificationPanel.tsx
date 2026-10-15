"use client";

import { useState, useEffect } from "react";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_OPTIONS,
  type GeminiModel,
} from "@/lib/ai/geminiModels";

interface Props {
  username: string;
  bio?: string;
  initialTweets?: any[];
}

export default function AiClassificationPanel({ username, bio, initialTweets = [] }: Props) {
  const [classification, setClassification] = useState("");
  const [leftRightScore, setLeftRightScore] = useState<number | null>(null);
  const [selectedGeminiModel, setSelectedGeminiModel] =
    useState<GeminiModel>(DEFAULT_GEMINI_MODEL);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tweetsExpanded, setTweetsExpanded] = useState(false);
  
  const tweets = initialTweets;
  const isFetchingTweets = false;
  const tweetsError = "";

  const handleGenerate = async () => {
    setIsLoading(true);
    setError("");
    setLeftRightScore(null);

    try {
      const response = await fetch("/api/profile-classification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Pass the tweets we already fetched during mount
        body: JSON.stringify({ username, tweets, geminiModel: selectedGeminiModel, bio }),
      });

      const data = (await response.json()) as {
        classification?: string;
        leftRightScore?: number | null;
        geminiModel?: GeminiModel;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate AI classification.");
      }

      setClassification(data.classification || "");
      setSelectedGeminiModel(data.geminiModel || selectedGeminiModel);
      setLeftRightScore(
        typeof data.leftRightScore === "number" ? data.leftRightScore : null
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while generating the classification."
      );
      setLeftRightScore(null);
    } finally {
      setIsLoading(false);
    }
  };

  const isButtonDisabled = isLoading || isFetchingTweets || !!tweetsError || tweets.length === 0;

  return (
    <div className="surface" style={{ padding: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 560 }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            AI Classification
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Generate an on-demand AI reading of this profile&apos;s likely position on the
            Indian ideological spectrum using the profile signals, X-style post data, and
            dashboard evidence shown above.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "nowrap",
            flex: "1 1 320px",
            minWidth: 280,
          }}
        >
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isButtonDisabled}
            style={{
              padding: "11px 18px",
              fontSize: 14,
              fontWeight: 600,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: isButtonDisabled ? "not-allowed" : "pointer",
              opacity: isButtonDisabled ? 0.75 : 1,
              transition: "opacity 0.2s ease",
            }}
          >
            {isFetchingTweets
              ? "Fetching Tweets..."
              : isLoading
                ? "Generating..."
                : classification
                  ? "Regenerate Classification"
                  : "Generate Classification"}
          </button>

          <select
            aria-label="Gemini mode"
            value={selectedGeminiModel}
            onChange={(event) => setSelectedGeminiModel(event.target.value as GeminiModel)}
            disabled={isLoading}
            title="Choose Gemini model"
            style={{
              minWidth: 180,
              height: 30,
              padding: "0px 10px",
              fontSize: 12,
              fontWeight: 650,
              color: "var(--text-primary)",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              outline: "none",
              cursor: isLoading ? "not-allowed" : "pointer",
              appearance: "none",
              WebkitAppearance: "none",
            }}
          >
            {GEMINI_MODEL_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
                style={{
                  color: "var(--text-primary)",
                  backgroundColor: "var(--bg-surface)",
                }}
              >
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isFetchingTweets && (
        <div className="surface-subtle" style={{ padding: "16px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 14,
                height: 14,
                border: "2px solid var(--accent)",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <p style={{ fontSize: 14, color: "var(--text-primary)", margin: 0 }}>
              Running Playwright Scraper to fetch recent tweets... (this may take up to 60s)
            </p>
          </div>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {tweetsError && (
        <div className="surface-subtle" style={{ padding: "16px", borderColor: "var(--down)", marginBottom: 16 }}>
          <p role="alert" style={{ fontSize: 13, color: "var(--down)", margin: 0 }}>
            Error fetching tweets: {tweetsError}. Cannot generate classification without real tweets.
          </p>
        </div>
      )}

      {!classification && !error && !isLoading && !isFetchingTweets && (
        <div className="surface-subtle" style={{ padding: "16px" }}>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            The AI will only run when you click the button. No automatic generation happens on page load.
          </p>
        </div>
      )}

      {isLoading && (
        <div className="surface-subtle" style={{ padding: "16px" }}>
          <p style={{ fontSize: 14, color: "var(--text-primary)" }}>
            Generating a profile classification with {selectedGeminiModel}...
          </p>
        </div>
      )}

      {error && (
        <div className="surface-subtle" style={{ padding: "16px", borderColor: "var(--down)" }}>
          <p role="alert" style={{ fontSize: 13, color: "var(--down)" }}>
            {error}
          </p>
        </div>
      )}

      {classification && !isLoading && (
        <div className="surface-subtle" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {leftRightScore !== null && (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 14px 12px",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                  Left - Right Placement
                </p>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                  Score: {leftRightScore}/100
                </p>
              </div>

              <div style={{ position: "relative", paddingTop: 22 }}>
                <div
                  style={{
                    height: 12,
                    borderRadius: 999,
                    background:
                      "linear-gradient(90deg, #1d4ed8 0%, #60a5fa 20%, #d1d5db 50%, #fca5a5 80%, #b91c1c 100%)",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                />

                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 0,
                    left: `${leftRightScore}%`,
                    transform: "translateX(-50%)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: "var(--text-primary)",
                      color: "var(--bg)",
                      fontSize: 11,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      marginBottom: 5,
                    }}
                  >
                    {leftRightScore}
                  </div>
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: "6px solid transparent",
                      borderRight: "6px solid transparent",
                      borderTop: "9px solid var(--text-primary)",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <span>Left</span>
                <span>Centre</span>
                <span>Right</span>
              </div>
            </div>
          )}

          <p
            style={{
              fontSize: 14,
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              lineHeight: 1.7,
            }}
          >
            {classification}
          </p>
        </div>
      )}

      {tweets.length > 0 && !isFetchingTweets && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setTweetsExpanded(!tweetsExpanded)}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              padding: "8px 16px",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {tweetsExpanded ? "▲ Hide" : "▼ View"} Fetched Tweets ({tweets.length})
          </button>

          {tweetsExpanded && (
            <div style={{ maxHeight: "520px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {tweets.map((t: any, idx: number) => {
                const date = t.created_at
                  ? new Date(t.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                  : null;

                const fmtNum = (n: number) =>
                  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
                  : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
                  : String(n);

                // Support both flat (x_eval_tweets) and nested (x_tweets_metadata) structures
                const likes   = t.likes   ?? t.metrics?.likes;
                const reposts = t.reposts ?? t.metrics?.reposts;
                const replies = t.replies ?? t.metrics?.replies;
                const views   = t.views   ?? t.metrics?.views;
                const hasMetrics = likes != null || reposts != null || replies != null || views != null;

                return (
                  <div key={t.tweet_id || idx} className="surface-subtle" style={{ padding: "14px 16px" }}>
                    {/* Header: date */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      {date && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{date}</span>}
                      {t.url && (
                        <a href={t.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
                          View on X →
                        </a>
                      )}
                    </div>

                    {/* Tweet text */}
                    <p style={{ fontSize: 14, color: "var(--text-primary)", margin: "0 0 10px 0", lineHeight: 1.6 }}>
                      {t.text}
                    </p>

                    {/* Metrics row */}
                    {hasMetrics && (
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const, borderTop: "1px solid var(--border)", paddingTop: 8, alignItems: "center" }}>
                        {[
                          { emoji: "♥", label: "Likes",   value: likes },
                          { emoji: "🔁", label: "Reposts", value: reposts },
                          { emoji: "💬", label: "Replies", value: replies },
                          { emoji: "👁", label: "Views",   value: views },
                        ].map(({ emoji, label, value }) =>
                          value != null ? (
                            <span key={label} style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                              {emoji} <strong style={{ color: "var(--text-primary)" }}>{fmtNum(value)}</strong> {label}
                            </span>
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

