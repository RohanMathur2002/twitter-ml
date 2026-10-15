"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InputForm({ mode }: { mode: "profile" | "tweet" | "keyword" }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const router = useRouter();

  // Reset value and error when mode changes
  useEffect(() => {
    setValue("");
    setError("");
  }, [mode]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(
        `Please enter a ${
          mode === "profile"
            ? "Twitter/X handle or profile URL"
            : mode === "tweet"
            ? "Twitter/X tweet URL"
            : "keyword, hashtag, or topic"
        }.`
      );
      return;
    }

    if (mode === "profile") {
      // Extract username from URL or @handle
      let username = trimmed;
      if (username.includes("twitter.com/") || username.includes("x.com/")) {
        const parts = username.split("/").filter(Boolean);
        username = parts[parts.length - 1].split("?")[0];
      }
      username = username.replace(/^@/, "");

      if (!/^[a-zA-Z0-9_]{1,50}$/.test(username)) {
        setError("Invalid handle. Only letters, numbers, and underscores allowed.");
        return;
      }

      setError("");

      // Save to history in localStorage
      try {
        const historyStr = localStorage.getItem("search_history");
        let history: string[] = historyStr ? JSON.parse(historyStr) : [];
        // Remove if exists to re-insert at top
        history = [username, ...history.filter((h) => h !== username)].slice(0, 10);
        localStorage.setItem("search_history", JSON.stringify(history));
      } catch (e) {
        console.error("Failed to save history", e);
      }

      router.push(`/profile?username=${username}`);
    } else if (mode === "tweet") {
      // Tweet mode
      let url = trimmed;
      let tweetId = "";
      
      try {
        // try to parse as URL
        const parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
        if (parsedUrl.hostname.includes("twitter.com") || parsedUrl.hostname.includes("x.com")) {
          const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
          const statusIndex = pathParts.indexOf("status");
          if (statusIndex !== -1 && pathParts.length > statusIndex + 1) {
            tweetId = pathParts[statusIndex + 1];
          }
        }
      } catch (e) {
        // ignore
      }

      if (!tweetId) {
        // If not a valid url with status, maybe they just entered ID
        if (/^\d+$/.test(url)) {
          tweetId = url;
        } else {
          setError("Invalid tweet URL. Please enter a valid x.com or twitter.com tweet link.");
          return;
        }
      }

      setError("");

      try {
        const historyStr = localStorage.getItem("tweet_history");
        let history: any[] = historyStr ? JSON.parse(historyStr) : [];
        const existing = history.find((h) => h.id === tweetId);
        const newItem = {
          id: tweetId,
          url: trimmed,
          username: existing?.username || "",
          text: existing?.text || "",
        };
        // Remove if exists to re-insert at top
        history = [newItem, ...history.filter((h) => h.id !== tweetId)].slice(0, 10);
        localStorage.setItem("tweet_history", JSON.stringify(history));
      } catch (e) {
        console.error("Failed to save history", e);
      }

      router.push(`/tweet?id=${tweetId}`);
    } else {
      // Keyword mode
      setError("");

      try {
        const historyStr = localStorage.getItem("keyword_history");
        let history: string[] = historyStr ? JSON.parse(historyStr) : [];
        history = [trimmed, ...history.filter((h) => h !== trimmed)].slice(0, 10);
        localStorage.setItem("keyword_history", JSON.stringify(history));
      } catch (e) {
        console.error("Failed to save keyword history", e);
      }

      router.push(`/keyword?q=${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col gap-3 items-stretch">
        <div className="relative">
          {/* @ prefix for profile mode */}
          {mode === "profile" && (
            <span
              aria-hidden
              className="absolute left-[14px] top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-[15px] font-medium pointer-events-none select-none"
            >
              @
            </span>
          )}
          <input
            id="main-input"
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError("");
            }}
            placeholder={
              mode === "profile"
                ? "handle or x.com/username"
                : mode === "tweet"
                ? "https://x.com/.../status/..."
                : "Enter keyword, hashtag, or phrase..."
            }
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className={`w-full ${mode === "profile" ? "pl-8" : "pl-4"} pr-4 py-3 text-[15px] border rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none transition-all duration-150 ease-in-out ${
              error
                ? "border-[var(--down)]"
                : isFocused
                ? "border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-muted)]"
                : "border-[var(--border)]"
            }`}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          />
        </div>

        {error && (
          <p role="alert" className="text-[12px] text-[var(--down)] -mt-1 m-0">
            {error}
          </p>
        )}

        <button
          id="analyze-button"
          type="submit"
          className="py-[11px] px-6 text-[14px] font-semibold bg-[var(--accent)] text-white border-none rounded-lg cursor-pointer tracking-[-0.01em] transition-opacity duration-150 ease-in-out hover:opacity-85"
        >
          {mode === "profile"
            ? "Analyze Profile"
            : mode === "tweet"
            ? "Analyze Tweet"
            : "Analyze Keyword"}
        </button>
      </div>
    </form>
  );
}
