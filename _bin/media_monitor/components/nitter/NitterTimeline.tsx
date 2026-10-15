"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NitterTweet } from "./NitterTweet";
import type { NitterTweet as TweetType } from "@/app/actions/nitter";
import { getMoreNitterTweets } from "@/app/actions/nitter";
import { Loader2 } from "lucide-react";
import styles from "./Nitter.module.css";

interface NitterTimelineProps {
  initialTweets: TweetType[];
  initialCursor: string | null;
  username: string;
}

export function NitterTimeline({ initialTweets, initialCursor, username }: NitterTimelineProps) {
  const [tweets, setTweets] = useState<TweetType[]>(initialTweets);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const cursorRef = useRef<string | null>(initialCursor);

  const loadMore = useCallback(async () => {
    const nextCursor = cursorRef.current;
    if (!nextCursor || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const data = await getMoreNitterTweets(username, nextCursor);
      if (data.tweets.length > 0) {
        setTweets((prev) => {
          const existing = new Set(prev.map((tweet) => `${tweet.id}:${tweet.date}`));
          const freshTweets = data.tweets.filter((tweet) => {
            const key = `${tweet.id}:${tweet.date}`;
            if (existing.has(key)) return false;
            existing.add(key);
            return true;
          });
          return [...prev, ...freshTweets];
        });
      }
      cursorRef.current = data.cursor;
      setCursor(data.cursor);
    } catch (error) {
      console.error("Error loading more tweets:", error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    setTweets(initialTweets);
    setCursor(initialCursor);
    cursorRef.current = initialCursor;
    loadingRef.current = false;
    setLoading(false);
  }, [initialCursor, initialTweets, username]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "700px 0px 700px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore, username]);

  return (
    <div className={styles.timeline}>
      {tweets.map((tweet) => (
        <NitterTweet key={tweet.id + tweet.date} tweet={tweet} />
      ))}

      {cursor && (
        <div ref={sentinelRef} className={styles.loadMoreWrap}>
          <button
            onClick={loadMore}
            disabled={loading}
            className={styles.loadMoreButton}
          >
            {loading ? (
              <>
                <Loader2 className={styles.spin} />
                Loading more...
              </>
            ) : (
              "Load More"
            )}
          </button>
        </div>
      )}

      {!cursor && tweets.length > 0 && (
        <p className={styles.end}>End of timeline.</p>
      )}
    </div>
  );
}
