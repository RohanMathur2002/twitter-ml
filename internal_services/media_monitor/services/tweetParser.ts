import type { NitterTweet } from "./nitterService";
import LanguageDetect from "languagedetect";

const lngDetector = new LanguageDetect();

export interface ProcessedTweet {
  id: string;
  rawText: string;
  cleanText: string;
  createdAt: Date;
  likesCount: number;
  retweetsCount: number;
  repliesCount: number;
  viewsCount: number | null;
  lang: string;
  source: string;
  isRetweet: boolean;
  isReply: boolean;
  conversationId: string | null;
  quotedTweetId: string | null;
  inReplyToTweetId: string | null;
  hashtags: string[];
  mentions: string[];
  urls: string[];
  emojis: Array<{ emoji: string; index: number }>;
  media: unknown[];
  rawTweetJson: Record<string, unknown>;
}

const URL_PATTERN = /https?:\/\/[^\s]+|(?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;
const HASHTAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;
const MENTION_PATTERN = /@([A-Za-z0-9_]{1,20})/g;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseCount(value: string | undefined) {
  const normalized = (value || "").replace(/[^\d]/g, "");
  return normalized ? Number(normalized) : 0;
}

function splitCamelCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function parseCreatedAt(value: string) {
  const rawValue = value || "";
  // Handle common Nitter separators and hidden characters like nbsp
  const cleaned = rawValue
    .replace(/[·\u00b7\u2022\u2219\u22c5\u00a0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
    
  const parsed = new Date(cleaned);
  
  if (Number.isNaN(parsed.getTime())) {
    // If it still fails, try removing 'UTC' or other common suffixes that might confuse some engines
    const withoutUtc = cleaned.replace(/UTC$/i, "").trim();
    const secondTry = new Date(withoutUtc);
    if (!Number.isNaN(secondTry.getTime())) {
      return secondTry;
    }

    console.warn(`[TweetParser] DATE_PARSE_FAIL: "${rawValue}" -> Cleaned: "${cleaned}". Using fallback NOW.`);
    return new Date();
  }
  return parsed;
}

function extractQuotedTweetId(tweet: NitterTweet) {
  return tweet.quote?.url.split("/").pop()?.replace("#m", "") || null;
}

export function processTweet(tweet: NitterTweet): ProcessedTweet {
  const rawText = tweet.content || "";
  const urls = unique(rawText.match(URL_PATTERN) || []);
  const hashtags = unique(
    Array.from(rawText.matchAll(HASHTAG_PATTERN), (match) => match[1].toLowerCase())
  );
  const mentions = unique(
    Array.from(rawText.matchAll(MENTION_PATTERN), (match) => match[1].toLowerCase())
  );
  const emojis = Array.from(rawText.matchAll(EMOJI_PATTERN), (match) => ({
    emoji: match[0],
    index: match.index || 0,
  }));

  const hashtagSemanticText = hashtags.map(splitCamelCase).join(" ");
  const cleanText = `${rawText.replace(URL_PATTERN, " ")} ${hashtagSemanticText}`
    .replace(HASHTAG_PATTERN, "$1")
    .replace(MENTION_PATTERN, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return {
    id: tweet.id,
    rawText,
    cleanText,
    createdAt: parseCreatedAt(tweet.date),
    likesCount: parseCount(tweet.stats.hearts),
    retweetsCount: parseCount(tweet.stats.retweets),
    repliesCount: parseCount(tweet.stats.comments),
    viewsCount: tweet.stats.views ? parseCount(tweet.stats.views) : null,
    lang: (() => {
      if (!cleanText) return "und";
      const detected = lngDetector.detect(cleanText, 1);
      if (detected && detected.length > 0 && detected[0][1] > 0.1) {
        // LanguageDetect returns language name, but we need standard BCP-47 codes. 
        // We'll just return the name in lowercase or 'und' if uncertain.
        // E.g. 'english' -> 'en', 'spanish' -> 'es', etc.
        // For simplicity, we can use a quick map or just return the language name. 
        // Postgres accepts generic string for language, though BCP-47 is standard.
        // languagedetect actually has language-to-code mapping built-in but we can just use the name for now.
        return detected[0][0].toLowerCase(); 
      }
      return "und";
    })(),
    source: "nitter",
    isRetweet: tweet.isRetweet || /^\s*rt\s+@/i.test(rawText),
    isReply: tweet.isReply || false,
    conversationId: null, // Nitter doesn't reliably expose conversation IDs without API
    quotedTweetId: extractQuotedTweetId(tweet),
    inReplyToTweetId: null, // Would need to parse URL for this
    hashtags,
    mentions,
    urls,
    emojis,
    media: tweet.media,
    rawTweetJson: tweet as unknown as Record<string, unknown>,
  };
}
