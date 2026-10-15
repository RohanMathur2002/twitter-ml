"use client";

import { MessageSquare, Repeat2, Heart, Eye, ExternalLink } from "lucide-react";
import type { NitterTweet as TweetType } from "@/app/actions/nitter";
import styles from "./Nitter.module.css";

const DEFAULT_TWEET_AVATAR =
  "https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png";

interface NitterTweetProps {
  tweet: TweetType;
}

export function NitterTweet({ tweet }: NitterTweetProps) {
  return (
    <div className={styles.tweetCard}>
      {tweet.isRetweet && (
        <div className={styles.retweet}>
          <Repeat2 size={13} />
          <span>{tweet.retweetedBy} retweeted</span>
        </div>
      )}

      <div className={styles.tweetBody}>
        <div>
          {tweet.avatar ? (
            <img
              src={tweet.avatar}
              alt={tweet.fullname}
              className={styles.tweetAvatar}
              onError={(e) => {
                e.currentTarget.src = DEFAULT_TWEET_AVATAR;
              }}
            />
          ) : (
            <img
              src={DEFAULT_TWEET_AVATAR}
              alt={tweet.fullname}
              className={styles.tweetAvatar}
            />
          )}
        </div>

        <div>
          <div className={styles.tweetHeader}>
            <div className={styles.tweetAuthor}>
              <span className={styles.tweetName}>{tweet.fullname}</span>
              <span className={styles.tweetMeta}>{tweet.username}</span>
              <span className={styles.tweetMeta}>&middot; {tweet.date}</span>
            </div>
            <a
              href={tweet.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.tweetAction}
            >
              <ExternalLink size={15} />
            </a>
          </div>

          <p className={styles.tweetText}>
            {tweet.content}
          </p>

          {tweet.media && tweet.media.length > 0 && (
            <div
              className={`${styles.mediaGrid} ${
                tweet.media.length > 1 ? styles.mediaGridTwo : ""
              }`}
            >
              {tweet.media.map((url, idx) => (
                <img
                  key={idx}
                  src={url}
                  alt={`Media ${idx + 1}`}
                  className={styles.mediaImage}
                  loading="lazy"
                />
              ))}
            </div>
          )}

          {tweet.quote && (
            <div className={styles.quote}>
              <div className={styles.quoteHeader}>
                {tweet.quote.avatar ? (
                  <img
                    src={tweet.quote.avatar}
                    alt={tweet.quote.fullname}
                    className={styles.quoteAvatar}
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_TWEET_AVATAR;
                    }}
                  />
                ) : (
                  <div className={styles.quoteAvatarPlaceholder} aria-hidden="true" />
                )}
                <span className={styles.quoteName}>{tweet.quote.fullname}</span>
                <span className={styles.quoteUser}>{tweet.quote.username}</span>
              </div>
              <p className={styles.quoteText}>
                {tweet.quote.content}
              </p>
            </div>
          )}

          <div className={styles.tweetStats}>
            <button className={styles.tweetStat}>
              <MessageSquare size={16} />
              <span>{tweet.stats.comments || "0"}</span>
            </button>
            <button className={styles.tweetStat}>
              <Repeat2 size={16} />
              <span>{tweet.stats.retweets || "0"}</span>
            </button>
            <button className={styles.tweetStat}>
              <Heart size={16} />
              <span>{tweet.stats.hearts || "0"}</span>
            </button>
            <div className={styles.tweetViews}>
              <Eye size={16} />
              <span>{tweet.stats.views || "0"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
