"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import InputForm from "@/components/InputForm";

function HomeContent() {
  const [mode, setMode] = useState<"profile" | "tweet" | "keyword">("profile");
  const [history, setHistory] = useState<string[]>([]);
  const [tweetHistory, setTweetHistory] = useState<any[]>([]);
  const [keywordHistory, setKeywordHistory] = useState<string[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q");

  useEffect(() => {
    if (q === "tweet") {
      setMode("tweet");
    } else if (q === "keyword") {
      setMode("keyword");
    } else if (q === "profile") {
      setMode("profile");
    }
  }, [q]);

  useEffect(() => {
    const historyStr = localStorage.getItem("search_history");
    if (historyStr) {
      try {
        const parsed = JSON.parse(historyStr) as string[];
        setHistory(parsed.slice(0, 5));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
    const tweetHistoryStr = localStorage.getItem("tweet_history");
    if (tweetHistoryStr) {
      try {
        const parsed = JSON.parse(tweetHistoryStr) as any[];
        setTweetHistory(parsed.slice(0, 5));
      } catch (e) {
        console.error("Failed to parse tweet history", e);
      }
    }
    const kwHistoryStr = localStorage.getItem("keyword_history");
    if (kwHistoryStr) {
      try {
        const parsed = JSON.parse(kwHistoryStr) as string[];
        setKeywordHistory(parsed.slice(0, 5));
      } catch (e) {
        console.error("Failed to parse keyword history", e);
      }
    }
  }, [mode]);

  const handleHistoryClick = (handle: string) => {
    router.push(`/profile?username=${handle}`);
  };

  const handleTweetHistoryClick = (id: string) => {
    router.push(`/tweet?id=${id}`);
  };

  const handleKeywordHistoryClick = (kw: string) => {
    router.push(`/keyword?q=${encodeURIComponent(kw)}`);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-10 px-6">
      <div className="w-full flex flex-col items-center gap-6">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] w-full max-w-[480px] p-10 flex flex-col items-center text-center gap-6 rounded-xl shadow-xl">
          <div className="w-full flex flex-col gap-2">
            <div className="flex bg-[var(--bg-muted)] rounded-lg p-1 mb-4">
              <button
                onClick={() => setMode("profile")}
                className={`flex-1 py-2 px-3 rounded-md text-[13px] font-medium transition-all duration-200 cursor-pointer ${
                  mode === "profile"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-sm"
                    : "bg-transparent text-[var(--text-muted)] border border-transparent"
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => setMode("tweet")}
                className={`flex-1 py-2 px-3 rounded-md text-[13px] font-medium transition-all duration-200 cursor-pointer ${
                  mode === "tweet"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-sm"
                    : "bg-transparent text-[var(--text-muted)] border border-transparent"
                }`}
              >
                Tweet
              </button>
              <button
                onClick={() => setMode("keyword")}
                className={`flex-1 py-2 px-3 rounded-md text-[13px] font-medium transition-all duration-200 cursor-pointer ${
                  mode === "keyword"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-sm"
                    : "bg-transparent text-[var(--text-muted)] border border-transparent"
                }`}
              >
                Keyword
              </button>
            </div>
            <h1 className="text-[24px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">
              {mode === "profile"
                ? "Analyze Profile"
                : mode === "tweet"
                ? "Analyze Tweet"
                : "Analyze Keyword"}
            </h1>
            <p className="text-[14px] text-[var(--text-secondary)] max-w-[320px] mx-auto">
              {mode === "profile"
                ? "Enter a Twitter/X handle to generate an analytical intelligence dossier."
                : mode === "tweet"
                ? "Enter a Twitter/X tweet link to generate a thread intelligence dossier."
                : "Enter any keyword, hashtag, or topic to analyze mentions and engagement."}
            </p>
          </div>

          <div className="w-full">
            <InputForm mode={mode} />
          </div>

          {(mode === "profile"
            ? history.length > 0
            : mode === "tweet"
            ? tweetHistory.length > 0
            : keywordHistory.length > 0) && (
            <div className="w-full flex flex-col gap-3 mt-2">
              <div className="flex items-center gap-2 opacity-80">
                <div className="flex-1 h-[1px] bg-[var(--border-subtle)]" />
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">
                  Recent History
                </span>
                <div className="flex-1 h-[1px] bg-[var(--border-subtle)]" />
              </div>
              
              <div className="flex flex-wrap justify-center gap-2">
                {mode === "profile"
                  ? history.map((handle) => (
                      <button
                        key={handle}
                        onClick={() => handleHistoryClick(handle)}
                        className="bg-transparent border border-[var(--border)] cursor-pointer py-1.5 px-3 rounded-[16px] text-[12px] font-medium text-[var(--text-primary)] transition-all duration-150 ease-in hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        @{handle}
                      </button>
                    ))
                  : mode === "tweet"
                  ? tweetHistory.map((item) => {
                      const label = (() => {
                        if (item.username && item.text) {
                          const displayUser = item.username.replace(/^@/, "");
                          const fullLabel = `${displayUser}: ${item.text}`;
                          return fullLabel.length > 30 ? `${fullLabel.substring(0, 27)}...` : fullLabel;
                        }
                        return (
                          item.url.replace(/^https?:\/\/(www\.)?/, "").substring(0, 25) +
                          (item.url.length > 25 ? "..." : "")
                        );
                      })();
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleTweetHistoryClick(item.id)}
                          className="bg-transparent border border-[var(--border)] cursor-pointer py-1.5 px-3 rounded-[16px] text-[12px] font-medium text-[var(--text-primary)] transition-all duration-150 ease-in hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          {label}
                        </button>
                      );
                    })
                  : keywordHistory.map((kw) => (
                      <button
                        key={kw}
                        onClick={() => handleKeywordHistoryClick(kw)}
                        className="bg-transparent border border-[var(--border)] cursor-pointer py-1.5 px-3 rounded-[16px] text-[12px] font-medium text-[var(--text-primary)] transition-all duration-150 ease-in hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        {kw}
                      </button>
                    ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-sm text-[var(--text-secondary)]">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
