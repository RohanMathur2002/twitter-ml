import * as cheerio from "cheerio";
import { pushEvent } from "./nitterHealthService";

export interface NitterTweet {
  id: string;
  url: string;
  avatar: string;
  fullname: string;
  username: string;
  date: string;
  content: string;
  stats: {
    comments: string;
    retweets: string;
    hearts: string;
    views: string;
  };
  quote?: {
    fullname: string;
    username: string;
    avatar: string;
    content: string;
    date: string;
    url: string;
    media: string[];
  };
  media: string[];
  isRetweet: boolean;
  retweetedBy?: string;
  isReply: boolean;
  replyToUsers: string[];
}

export interface NitterProfile {
  name: string;
  username: string;
  bio: string;
  avatar: string;
  banner: string;
  location: string;
  website: {
    text: string;
    url: string;
  };
  joined: string;
  stats: {
    tweets: string;
    following: string;
    followers: string;
    likes: string;
  };
  tweets: NitterTweet[];
  cursor: string | null;
}

export interface NitterTweetsPage {
  tweets: NitterTweet[];
  cursor: string | null;
}

const NITTER_HOST = "http://localhost:8081";
const PAGES_PER_SCROLL = 3;

function cleanHandle(username: string) {
  return username.replace("@", "").trim();
}

function absoluteNitterUrl(path?: string) {
  const value = path?.trim();
  if (!value) return "";
  if (value.startsWith("http")) return value;
  return `${NITTER_HOST}${value}`;
}

function extractCursor(href?: string) {
  if (!href || !href.includes("cursor=")) return null;
  return href.split("cursor=")[1]?.split("&")[0] || null;
}

function extractNextCursor($: cheerio.CheerioAPI) {
  const showMoreCursor = extractCursor($(".show-more a").last().attr("href"));
  if (showMoreCursor) return showMoreCursor;

  let cursor: string | null = null;
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    const nextCursor = extractCursor(href);
    if (nextCursor) cursor = nextCursor;
  });
  return cursor;
}

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 4000;
const DELAY_BETWEEN_REQUESTS_MS = 1000;
const JITTER_MAX_MS = 500;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Add random jitter to a delay to prevent request stampedes */
function jitteredDelay(baseMs: number): Promise<void> {
  const jitter = Math.floor(Math.random() * JITTER_MAX_MS);
  return delay(baseMs + jitter);
}

// ─── Error Classification ─────────────────────────────────────────────────────

export type NitterErrorType =
  | "session_rate_limit"    // One session exhausted, others may work
  | "global_rate_limit"     // All sessions exhausted
  | "proxy_blocked"         // Proxy IP is flagged by X
  | "session_expired"       // Auth tokens invalid / account locked
  | "nitter_unreachable"    // Can't reach Nitter at all
  | "cursor_exhausted"      // Twitter's ~800 tweet wall
  | "unknown";

export class NitterError extends Error {
  type: NitterErrorType;
  httpStatus?: number;

  constructor(type: NitterErrorType, message: string, httpStatus?: number) {
    super(message);
    this.name = "NitterError";
    this.type = type;
    this.httpStatus = httpStatus;
  }
}

// Thrown when Nitter's cursor goes stale (404) — not a hard error, just end of timeline
export class CursorExhaustedError extends Error {
  constructor(message = "Nitter cursor exhausted (404)") {
    super(message);
    this.name = "CursorExhaustedError";
  }
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

const CIRCUIT_FAILURE_THRESHOLD = 3;  // Open circuit after N consecutive failures
const CIRCUIT_COOLDOWN_MS = 60_000;   // Wait 60s before trying again

interface CircuitBreakerState {
  consecutiveFailures: number;
  state: "closed" | "open" | "half-open";
  openedAt: number | null;
  lastError: string | null;
}

const circuitBreaker: CircuitBreakerState = {
  consecutiveFailures: 0,
  state: "closed",
  openedAt: null,
  lastError: null,
};

function checkCircuitBreaker(): void {
  if (circuitBreaker.state === "open") {
    const elapsed = Date.now() - (circuitBreaker.openedAt ?? 0);
    if (elapsed >= CIRCUIT_COOLDOWN_MS) {
      circuitBreaker.state = "half-open";
      console.log(`[NitterService] 🔄 Circuit half-open — attempting recovery after ${Math.round(elapsed / 1000)}s cooldown`);
    } else {
      const remaining = Math.round((CIRCUIT_COOLDOWN_MS - elapsed) / 1000);
      throw new NitterError(
        "global_rate_limit",
        `Circuit breaker is OPEN — all requests blocked for ${remaining}s more. Last error: ${circuitBreaker.lastError}`
      );
    }
  }
}

function recordSuccess(): void {
  if (circuitBreaker.state !== "closed") {
    console.log(`[NitterService] ✅ Circuit breaker closed — Nitter recovered`);
  }
  circuitBreaker.consecutiveFailures = 0;
  circuitBreaker.state = "closed";
  circuitBreaker.openedAt = null;
  circuitBreaker.lastError = null;
}

function recordFailure(error: string): void {
  circuitBreaker.consecutiveFailures++;
  circuitBreaker.lastError = error;

  if (circuitBreaker.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD && circuitBreaker.state !== "open") {
    circuitBreaker.state = "open";
    circuitBreaker.openedAt = Date.now();
    console.log(`[NitterService] 🔴 Circuit breaker OPEN after ${circuitBreaker.consecutiveFailures} consecutive failures. Cooling down for ${CIRCUIT_COOLDOWN_MS / 1000}s`);
  }
}

/** Get current circuit breaker state (for health dashboard) */
export function getCircuitBreakerState() {
  return { ...circuitBreaker };
}

// ─── Request tracking ─────────────────────────────────────────────────────────

const requestLog: { timestamp: number; success: boolean; statusCode?: number }[] = [];
const REQUEST_LOG_WINDOW_MS = 5 * 60 * 1000; // 5 minute window

function trackRequest(success: boolean, statusCode?: number) {
  const now = Date.now();
  requestLog.push({ timestamp: now, success, statusCode });
  // Prune old entries
  const cutoff = now - REQUEST_LOG_WINDOW_MS;
  while (requestLog.length > 0 && requestLog[0].timestamp < cutoff) {
    requestLog.shift();
  }
}

/** Get request stats for the health dashboard */
export function getRequestStats() {
  const now = Date.now();
  const cutoff = now - REQUEST_LOG_WINDOW_MS;
  const recent = requestLog.filter((r) => r.timestamp >= cutoff);

  const total = recent.length;
  const successes = recent.filter((r) => r.success).length;
  const failures = total - successes;
  const rateLimits = recent.filter((r) => r.statusCode === 429).length;

  // Requests per minute
  const windowMinutes = REQUEST_LOG_WINDOW_MS / 60_000;
  const rpm = total / windowMinutes;

  return { total, successes, failures, rateLimits, rpm: Math.round(rpm * 10) / 10 };
}

// ─── Fetch with circuit breaker ───────────────────────────────────────────────

function classifyNitterHtml(html: string): NitterErrorType | null {
  if (html.includes("Instance has been rate limited")) return "global_rate_limit";
  if (html.includes("Instance has no auth tokens")) return "global_rate_limit";
  if (html.includes("Account has been suspended")) return "session_expired";
  if (html.includes("This account doesn't exist")) return "unknown";
  if (html.includes('class="error-panel"')) return "unknown"; // Nitter internal backend errors (like ProtocolError)
  return null;
}

async function fetchNitterHtml(username: string, cursor?: string, retryCount = 0): Promise<string> {
  // Check circuit breaker before making request
  checkCircuitBreaker();

  const cleanUsername = cleanHandle(username);
  const url = cursor
    ? `${NITTER_HOST}/${cleanUsername}/with_replies?cursor=${encodeURIComponent(cursor)}`
    : `${NITTER_HOST}/${cleanUsername}/with_replies`;

  if (retryCount > 0) {
    console.log(`\x1b[33m[Nitter] ⚠️ Retrying profile fetch... (attempt ${retryCount}/${MAX_RETRIES})\x1b[0m`);
  } else {
    await jitteredDelay(DELAY_BETWEEN_REQUESTS_MS);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    trackRequest(false);
    recordFailure(err instanceof Error ? err.message : "Network error");
    throw new NitterError("nitter_unreachable", `Cannot reach Nitter: ${err instanceof Error ? err.message : "Unknown"}`);
  }

  if (response.status === 429) {
    trackRequest(false, 429);
    recordFailure("HTTP 429 Too Many Requests");

    if (retryCount < MAX_RETRIES) {
      const backoff = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`\x1b[33m[Nitter] ⏳ HTTP 429 Too Many Requests. Sleeping for ${backoff}ms...\x1b[0m`);
      await jitteredDelay(backoff);
      return fetchNitterHtml(username, cursor, retryCount + 1);
    }

    throw new NitterError("global_rate_limit", "All retries exhausted on 429", 429);
  }

  // 404 during pagination = Nitter cursor went stale (Twitter's ~800 tweet wall)
  if (response.status === 404 && cursor) {
    trackRequest(false, 404);
    console.log(`\x1b[33m[Nitter] 📭 Cursor returned 404 — timeline wall reached. Ending pagination gracefully.\x1b[0m`);
    throw new CursorExhaustedError();
  }

  if (!response.ok) {
    trackRequest(false, response.status);
    recordFailure(`HTTP ${response.status} ${response.statusText}`);
    throw new NitterError("unknown", `Nitter response error: ${response.status} ${response.statusText}`, response.status);
  }

  const html = await response.text();

  // Check for soft errors in the HTML body
  const errorType = classifyNitterHtml(html);
  if (errorType) {
    trackRequest(false);
    recordFailure(errorType);

    if (retryCount < MAX_RETRIES) {
      const backoff = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`\x1b[33m[Nitter] ⏳ Soft HTML Error (${errorType}). Retrying request internally in ${backoff}ms...\x1b[0m`);
      await jitteredDelay(backoff);
      return fetchNitterHtml(username, cursor, retryCount + 1);
    }

    throw new NitterError(errorType, `Nitter returned a ${errorType} page`);
  }

  // Success!
  trackRequest(true, response.status);
  recordSuccess();
  return html;
}


async function fetchNitterSearchHtml(query: string, cursor?: string, retryCount = 0): Promise<string> {
  // Check circuit breaker before making request
  checkCircuitBreaker();

  const url = cursor
    ? `${NITTER_HOST}/search?q=${encodeURIComponent(query)}&cursor=${encodeURIComponent(cursor)}`
    : `${NITTER_HOST}/search?q=${encodeURIComponent(query)}`;

  if (retryCount > 0) {
    console.log(`\x1b[33m[Nitter] ⚠️ Retrying search fetch... (attempt ${retryCount}/${MAX_RETRIES})\x1b[0m`);
  } else {
    await jitteredDelay(DELAY_BETWEEN_REQUESTS_MS);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    trackRequest(false);
    recordFailure(err instanceof Error ? err.message : "Network error");
    throw new NitterError("nitter_unreachable", `Cannot reach Nitter (search): ${err instanceof Error ? err.message : "Unknown"}`);
  }

  if (response.status === 429) {
    trackRequest(false, 429);
    recordFailure("HTTP 429 Too Many Requests (Search)");

    if (retryCount < MAX_RETRIES) {
      const backoff = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`\x1b[33m[Nitter] ⏳ HTTP 429 Too Many Requests (Search). Sleeping for ${backoff}ms...\x1b[0m`);
      await jitteredDelay(backoff);
      return fetchNitterSearchHtml(query, cursor, retryCount + 1);
    }

    throw new NitterError("global_rate_limit", "All retries exhausted on 429 (search)", 429);
  }

  if (!response.ok) {
    trackRequest(false, response.status);
    recordFailure(`Search HTTP ${response.status} ${response.statusText}`);
    throw new NitterError("unknown", `Nitter search error: ${response.status} ${response.statusText}`, response.status);
  }

  const html = await response.text();

  const errorType = classifyNitterHtml(html);
  if (errorType) {
    trackRequest(false);
    recordFailure(`Search: ${errorType}`);

    if (retryCount < MAX_RETRIES) {
      const backoff = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`\x1b[33m[Nitter] ⏳ Soft HTML Error (${errorType}). Retrying search request internally in ${backoff}ms...\x1b[0m`);
      await jitteredDelay(backoff);
      return fetchNitterSearchHtml(query, cursor, retryCount + 1);
    }

    throw new NitterError(errorType, `Nitter search returned a ${errorType} page`);
  }

  trackRequest(true, response.status);
  recordSuccess();
  return html;
}

export async function fetchNitterRepliesHtml(username: string, sinceStr: string, untilStr: string, cursor?: string, retryCount = 0): Promise<string> {
  checkCircuitBreaker();
  const baseUrl = `${NITTER_HOST}/${username}/search?f=tweets&q=&f-replies=on&since=${sinceStr}&until=${untilStr}`;
  const url = cursor ? `${baseUrl}&cursor=${encodeURIComponent(cursor)}` : baseUrl;

  if (retryCount > 0) {
    console.log(`\x1b[33m[Nitter] ⚠️ Retrying replies fetch... (attempt ${retryCount}/${MAX_RETRIES})\x1b[0m`);
  } else {
    await jitteredDelay(DELAY_BETWEEN_REQUESTS_MS);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    trackRequest(false);
    recordFailure(err instanceof Error ? err.message : "Network error");
    throw new NitterError("nitter_unreachable", `Cannot reach Nitter (replies): ${err instanceof Error ? err.message : "Unknown"}`);
  }

  if (response.status === 429) {
    trackRequest(false, 429);
    recordFailure("HTTP 429 Too Many Requests (Replies)");

    if (retryCount < MAX_RETRIES) {
      const backoff = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`\x1b[33m[Nitter] ⏳ HTTP 429 Too Many Requests (Replies). Sleeping for ${backoff}ms...\x1b[0m`);
      await jitteredDelay(backoff);
      return fetchNitterRepliesHtml(username, sinceStr, untilStr, cursor, retryCount + 1);
    }

    throw new NitterError("global_rate_limit", "All retries exhausted on 429 (replies)", 429);
  }

  if (!response.ok) {
    trackRequest(false, response.status);
    recordFailure(`Replies HTTP ${response.status} ${response.statusText}`);
    throw new NitterError("unknown", `Nitter replies error: ${response.status} ${response.statusText}`, response.status);
  }

  const html = await response.text();

  const errorType = classifyNitterHtml(html);
  if (errorType) {
    trackRequest(false);
    recordFailure(`Replies: ${errorType}`);

    if (retryCount < MAX_RETRIES) {
      const backoff = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.log(`\x1b[33m[Nitter] ⏳ Soft HTML Error (${errorType}). Retrying replies request internally in ${backoff}ms...\x1b[0m`);
      await jitteredDelay(backoff);
      return fetchNitterRepliesHtml(username, sinceStr, untilStr, cursor, retryCount + 1);
    }

    throw new NitterError(errorType, `Nitter replies returned a ${errorType} page`);
  }

  trackRequest(true, response.status);
  recordSuccess();
  return html;
}


function parseInteger(value: string) {
  const normalized = value.replace(/[^\d]/g, "");
  return normalized ? Number(normalized) : 0;
}

function parseTweets($: cheerio.CheerioAPI) {
  const tweets: NitterTweet[] = [];

  $(".timeline-item").each((_, el) => {
    const $tweet = $(el);
    if ($tweet.hasClass("show-more")) return;

    const tweetUrl = $tweet.find(".tweet-link").attr("href") || "";
    const tweetId = tweetUrl.split("/").pop()?.replace("#m", "") || "";
    if (!tweetId) return;

    const media: string[] = [];
    $tweet.find(".attachments img").each((_, img) => {
      const url = absoluteNitterUrl($(img).attr("src"));
      if (url) media.push(url);
    });

    const quoteEl = $tweet.find(".quote");
    let quote: NitterTweet["quote"] | undefined;
    if (quoteEl.length > 0) {
      quote = {
        fullname: quoteEl.find(".fullname").text().trim(),
        username: quoteEl.find(".username").text().trim(),
        avatar: absoluteNitterUrl(quoteEl.find(".avatar").attr("src")),
        content: quoteEl.find(".quote-text").text().trim(),
        date: quoteEl.find(".tweet-date a").attr("title") || "",
        url: absoluteNitterUrl(quoteEl.find(".quote-link").attr("href")),
        media: [],
      };
      quoteEl.find(".quote-media-container img").each((_, img) => {
        const url = absoluteNitterUrl($(img).attr("src"));
        if (url) quote?.media.push(url);
      });
    }

    tweets.push({
      id: tweetId,
      url: absoluteNitterUrl(tweetUrl),
      avatar: absoluteNitterUrl($tweet.find(".tweet-avatar img").attr("src")),
      fullname: $tweet.find(".fullname").first().text().trim(),
      username: $tweet.find(".username").first().text().trim(),
      date: (() => {
        const $dateContainer = $tweet.find(".tweet-date");
        const title = $dateContainer.find("[title]").attr("title") || $dateContainer.attr("title");
        const text = $dateContainer.text().trim();
        const d = title || text;
        if (!d) console.warn(`[NitterService] No date found for tweet ${tweetId}`);
        return d;
      })(),
      content: $tweet.find(".tweet-content").text().trim(),
      stats: {
        comments: $tweet.find(".icon-comment").parent().text().trim() || "0",
        retweets: $tweet.find(".icon-retweet").parent().last().text().trim() || "0",
        hearts: $tweet.find(".icon-heart").parent().text().trim() || "0",
        views: $tweet.find(".icon-views").parent().text().trim() || "0",
      },
      quote,
      media,
      isRetweet: $tweet.find(".retweet-header").length > 0,
      retweetedBy: $tweet.find(".retweet-header").text().trim().replace(" retweeted", ""),
      isReply: $tweet.find(".replying-to").length > 0,
      replyToUsers: $tweet.find(".replying-to a").map((_, a) => $(a).text().trim().replace("@", "")).get(),
    });
  });

  return tweets;
}

function parseProfile($: cheerio.CheerioAPI, tweets: NitterTweet[], cursor: string | null): NitterProfile {
  return {
    name: $(".profile-card-fullname").text().trim(),
    username: $(".profile-card-username").text().trim(),
    bio: $(".profile-bio p").text().trim(),
    avatar: absoluteNitterUrl($(".profile-card-avatar img").attr("src")),
    banner: absoluteNitterUrl($(".profile-banner img").attr("src")),
    location: $(".profile-location span:last-child").text().trim(),
    website: {
      text: $(".profile-website a").text().trim(),
      url: $(".profile-website a").attr("href") || "",
    },
    joined: $(".profile-joindate").text().trim().replace("Joined ", ""),
    stats: {
      tweets: String(parseInteger($(".profile-statlist .posts .profile-stat-num").text())),
      following: String(parseInteger($(".profile-statlist .following .profile-stat-num").text())),
      followers: String(parseInteger($(".profile-statlist .followers .profile-stat-num").text())),
      likes: String(parseInteger($(".profile-statlist .likes .profile-stat-num").text())),
    },
    tweets,
    cursor,
  };
}

export async function getNitterProfile(username: string, cursor?: string): Promise<NitterProfile | null> {
  try {
    const html = await fetchNitterHtml(username, cursor);
    const $ = cheerio.load(html);

    // Check if the page is empty / rate limited but returned 200 OK
    if ($(".timeline-item").length === 0 && $(".profile-card").length === 0) {
      console.log(`\x1b[33m[Nitter] ⚠️ Fetched profile page but found no tweets or profile info. Nitter might be silently rate limiting or IP blocked.\x1b[0m`);
    }

    const tweets = parseTweets($);
    return parseProfile($, tweets, extractNextCursor($));
  } catch (error) {
    console.error("Error fetching Nitter profile:", error);
    return null;
  }
}

export async function getMoreNitterTweets(
  username: string,
  cursor: string,
  pages = PAGES_PER_SCROLL
): Promise<NitterTweetsPage> {
  const tweets: NitterTweet[] = [];
  let nextCursor: string | null = cursor;
  const seen = new Set<string>();

  for (let page = 0; page < pages && nextCursor; page += 1) {
    const html = await fetchNitterHtml(username, nextCursor);
    const $ = cheerio.load(html);
    for (const tweet of parseTweets($)) {
      const key = `${tweet.id}:${tweet.date}`;
      if (!seen.has(key)) {
        seen.add(key);
        tweets.push(tweet);
      }
    }
    const cursorFromPage = extractNextCursor($);
    nextCursor = cursorFromPage && cursorFromPage !== nextCursor ? cursorFromPage : null;
  }

  return { tweets, cursor: nextCursor };
}

export function parseNitterDate(dateStr: string): Date {
  const cleaned = (dateStr || "")
    .replace(/[·\u00b7\u2022\u2219\u22c5\u00a0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parsed = new Date(cleaned);
  if (isNaN(parsed.getTime())) {
    const withoutUtc = cleaned.replace(/UTC$/i, "").trim();
    return new Date(withoutUtc);
  }
  return parsed;
}

export async function fetchRecentUserTweets(
  username: string,
  maxPages = 30, // Usually hits a wall before 30 pages
  onTweetsFetched?: (tweets: NitterTweet[]) => Promise<void>,
  stopAtDate?: Date | null
) {
  const firstPage = await getNitterProfile(username);
  if (!firstPage) return null;

  if (firstPage.stats.tweets !== "0" && firstPage.tweets.length === 0) {
    pushEvent("silent_rate_limit", `Timeline rate limited (0 tweets returned for active profile @${username})`);
    throw new NitterError("global_rate_limit", "Silent timeline rate limit detected (profile has tweets, but timeline is empty)");
  }

  let tweets = [...firstPage.tweets];
  const seen = new Set(tweets.map((tweet) => `${tweet.id}:${tweet.date}`));

  console.log(`\x1b[33m[Nitter] 👤 Profile fetched for @${username}. Found ${firstPage.tweets.length} tweets on page 1.\x1b[0m`);

  if (onTweetsFetched && tweets.length > 0) {
    await onTweetsFetched(tweets);
  }

  let cursor = firstPage.cursor;
  let pagesFetched = 1;
  let reachedStopDate = false;
  let zeroTweetRetries = 0;

  while (cursor && pagesFetched < maxPages && !reachedStopDate) {
    let html: string;
    try {
      html = await fetchNitterHtml(username, cursor);
    } catch (err) {
      if (err instanceof CursorExhaustedError) {
        // Nitter's 404 wall — gracefully stop paginating, let Phase 2 fill the gap
        console.log(`\x1b[33m[Nitter] 🛑 Cursor exhausted after ${pagesFetched} pages. Handing off to archival search.\x1b[0m`);
        cursor = null;
        break;
      }
      throw err; // Re-throw real errors
    }

    const $ = cheerio.load(html);
    const pageTweets: NitterTweet[] = [];

    for (const tweet of parseTweets($)) {
      const key = `${tweet.id}:${tweet.date}`;
      if (!seen.has(key)) {
        seen.add(key);
        pageTweets.push(tweet);

        if (stopAtDate) {
          const d = parseNitterDate(tweet.date);
          if (!isNaN(d.getTime()) && d <= stopAtDate) {
            reachedStopDate = true;
          }
        }
      }
    }

    console.log(`\x1b[33m[Nitter] 📄 Phase 1: Page ${pagesFetched + 1}: Found ${pageTweets.length} new tweets (total seen: ${seen.size}).\x1b[0m`);

    if (pageTweets.length === 0) {
      console.log(`\x1b[33m[Nitter] 📭 Phase 1 page returned 0 tweets. Accepting as end of top-down search.\x1b[0m`);
      cursor = null;
      break;
    } else {
      if (onTweetsFetched) {
        await onTweetsFetched(pageTweets);
      }
      tweets.push(...pageTweets);
    }

    const nextCursor = extractNextCursor($);
    cursor = nextCursor && nextCursor !== cursor ? nextCursor : null;
    pagesFetched += 1;
  }

  return {
    profile: firstPage,
    tweets,
    pagesFetched,
    reachedStopDate,
    exhaustedCursor: !cursor,
  };
}

export async function runIntelligentArchivalSearch(
  username: string,
  sinceDate: Date,
  untilDate: Date,
  initialTweetsForRate: NitterTweet[],
  onTweetsFetched?: (tweets: NitterTweet[]) => Promise<void>,
  fetchReplies = false
) {
  const tweets: NitterTweet[] = [];
  const seen = new Set<string>();

  let timelineTweetSize = 500;
  const minTimeRangeDays = 10;
  const maxTimeRangeDays = 18 * 30; // 540 days

  // Calculate initial rate (days per tweet)
  let rateDaysPerTweet = 1; // Default fallback
  if (initialTweetsForRate.length > 10) {
    const sorted = [...initialTweetsForRate]
      .map(t => parseNitterDate(t.date))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime()); // newest first

    if (sorted.length > 1) {
      const diffMs = sorted[0].getTime() - sorted[sorted.length - 1].getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      rateDaysPerTweet = diffDays / sorted.length;
      if (rateDaysPerTweet <= 0) rateDaysPerTweet = 1;
    }
  }

  let currentUntil = new Date(untilDate);
  let pagesFetched = 0;

  console.log(`\x1b[33m[Nitter] 🔍 Starting Intelligent Archival for @${username} from ${currentUntil.toISOString().split('T')[0]} back to ${sinceDate.toISOString().split('T')[0]}\x1b[0m`);

  while (currentUntil > sinceDate) {
    let windowDays = timelineTweetSize * rateDaysPerTweet;
    windowDays = Math.max(minTimeRangeDays, Math.min(windowDays, maxTimeRangeDays));

    let currentSince = new Date(currentUntil);
    currentSince.setDate(currentSince.getDate() - windowDays);
    if (currentSince < sinceDate) {
      currentSince = new Date(sinceDate);
    }

    const sinceStr = currentSince.toISOString().split('T')[0];
    let untilStr = currentUntil.toISOString().split('T')[0];

    console.log(`\x1b[33m[Nitter] 📅 Search timeline chosen: ${sinceStr} to ${untilStr} (${Math.round(windowDays)} days window)\x1b[0m`);

    // Fetch this window
    let cursor: string | null = null;
    let windowFinished = false;
    let newInWindow = 0;
    let errorRetries = 0;
    const MAX_ERROR_RETRIES = 3;
    
    let oldestDateInWindow: Date | null = null;

    while (!windowFinished) {
      try {
        let html = "";
        let query = "";
        let pageTweets: NitterTweet[] = [];
        let $ = cheerio.load('');

        // Twitter API guest tokens randomly drop queries and return 0 results.
        // We must retry a 0-tweet response a few times before trusting it.
        let emptyPageRetries = 0;
        const MAX_EMPTY_RETRIES = 2;

        while (emptyPageRetries <= MAX_EMPTY_RETRIES) {
          if (fetchReplies) {
            query = `Replies for ${username} (${sinceStr} to ${untilStr})`;
            html = await fetchNitterRepliesHtml(username, sinceStr, untilStr, cursor || undefined);
          } else {
            query = `from:${username} include:nativeretweets since:${sinceStr} until:${untilStr}`; 
            html = await fetchNitterSearchHtml(query, cursor || undefined);
          }
          $ = cheerio.load(html);
          pageTweets = parseTweets($);

          if (pageTweets.length > 0) {
            break; // Valid tweets found, proceed
          }
          
          emptyPageRetries++;
          if (emptyPageRetries <= MAX_EMPTY_RETRIES) {
            console.log(`\x1b[33m[Nitter] ⚠️ Page returned 0 tweets. Retrying exact same query to combat Twitter API flakiness (attempt ${emptyPageRetries}/${MAX_EMPTY_RETRIES})...\x1b[0m`);
            await new Promise(resolve => setTimeout(resolve, 2000 * emptyPageRetries));
          }
        }

        if (pageTweets.length === 0) {
          // ─── VERIFICATION PROBE ─────────────────────────────────────────
          // A page returned 0 tweets. Is the proxy banned, or is the window
          // genuinely exhausted? The probe is the SINGLE SOURCE OF TRUTH.
          //
          // Strategy: search a narrow window around the last known tweet date.
          // Since we KNOW that tweet exists, the probe MUST return ≥1 result
          // if the proxy is healthy. If it returns 0, the proxy is banned and
          // we keep retrying until it rotates. No retry limits — we wait.
          // ─────────────────────────────────────────────────────────────────
          
          let referenceTweet: NitterTweet | null = null;
          if (tweets.length > 0) {
            referenceTweet = tweets[tweets.length - 1];
          } else if (initialTweetsForRate.length > 0) {
            referenceTweet = initialTweetsForRate[initialTweetsForRate.length - 1];
          }

          let probeQueryStr = "";
          if (!referenceTweet) {
            console.log(`\x1b[33m[Nitter] 📭 No reference tweet available. Falling back to global proxy health probe.\x1b[0m`);
            probeQueryStr = `twitter`;
          } else {
            const refDate = parseNitterDate(referenceTweet.date);
            if (!isNaN(refDate.getTime())) {
              const pSince = new Date(refDate);
              pSince.setDate(pSince.getDate() - 2);
              const pUntil = new Date(refDate);
              pUntil.setDate(pUntil.getDate() + 3);
              const pSinceStr = pSince.toISOString().split('T')[0];
              const pUntilStr = pUntil.toISOString().split('T')[0];
              if (fetchReplies) {
                // For replies probe, we can just use the user's handle again in a known good window
                probeQueryStr = `Replies for ${username} (${pSinceStr} to ${pUntilStr})`;
              } else {
                probeQueryStr = `from:${username} include:nativeretweets since:${pSinceStr} until:${pUntilStr}`;
              }
            } else {
              console.log(`\x1b[33m[Nitter] 📭 Reference tweet has unparseable date. Falling back to global proxy health probe.\x1b[0m`);
              probeQueryStr = `twitter`;
            }
          }

          // Keep probing until we get ≥1 tweet (proving proxy health)
          let probeAttempt = 0;
          while (true) {
            probeAttempt++;
            console.log(`\x1b[33m[Nitter] 🕵️ Page returned 0 tweets. Launching verification probe (attempt ${probeAttempt})...\x1b[0m`);
            
            try {
              let probeHtml = "";
              if (probeQueryStr === "twitter") {
                 probeHtml = await fetchNitterSearchHtml(`twitter`);
              } else if (fetchReplies && referenceTweet && !isNaN(parseNitterDate(referenceTweet.date).getTime())) {
                 const refDate = parseNitterDate(referenceTweet.date);
                 const pSinceStr = new Date(refDate.getTime() - 2 * 86400000).toISOString().split('T')[0];
                 const pUntilStr = new Date(refDate.getTime() + 3 * 86400000).toISOString().split('T')[0];
                 probeHtml = await fetchNitterRepliesHtml(username, pSinceStr, pUntilStr);
              } else {
                 probeHtml = await fetchNitterSearchHtml(probeQueryStr);
              }
              const probe$ = cheerio.load(probeHtml);
              const probeTweets = parseTweets(probe$);

              if (probeTweets.length > 0) {
                // ✅ Probe found tweets — proxy is healthy!
                // Upsert any new ones we haven't seen yet.
                const newProbeTweets: NitterTweet[] = [];
                for (const t of probeTweets) {
                  const key = `${t.id}:${t.date}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    newProbeTweets.push(t);
                    tweets.push(t);
                  }
                }
                if (newProbeTweets.length > 0 && onTweetsFetched) {
                  await onTweetsFetched(newProbeTweets);
                }

                console.log(`\x1b[32m[Nitter] ✅ Probe found ${probeTweets.length} tweets (${newProbeTweets.length} new). Proxy healthy.\x1b[0m`);
                if (cursor && oldestDateInWindow && oldestDateInWindow > currentSince) {
                   const oldestStr = oldestDateInWindow.toISOString().split('T')[0];
                   console.log(`\x1b[33m[Nitter] 🛑 Pagination wall reached near ${oldestStr}. Resetting search window to bypass limit.\x1b[0m`);
                   
                   const newUntilDate = new Date(oldestDateInWindow);
                   newUntilDate.setDate(newUntilDate.getDate() - 1);
                   const newUntilStr = newUntilDate.toISOString().split('T')[0];
                   
                   if (newUntilStr >= currentSince.toISOString().split('T')[0]) {
                       untilStr = newUntilStr;
                       cursor = null;
                   } else {
                       console.log(`\x1b[32m[Nitter] 🏁 Reached the end of the window.\x1b[0m`);
                       windowFinished = true;
                   }
                } else {
                   console.log(`\x1b[32m[Nitter] ✅ Window genuinely exhausted.\x1b[0m`);
                   windowFinished = true;
                }
                break; // Break out of probe loop
              }
            } catch (e) {
              // Probe request itself failed — treat same as 0 results
              console.log(`\x1b[31m[Nitter] ❌ Probe request failed: ${e instanceof Error ? e.message : e}\x1b[0m`);
            }

            // Probe returned 0 or failed — proxy is banned. Wait for rotation.
            const backoff = Math.min(5000 * Math.pow(2, probeAttempt), 120_000); // Cap at 2 min
            console.log(`\x1b[33m[Nitter] ⏳ Probe returned 0 tweets — proxy is banned. Waiting ${backoff/1000}s for proxy rotation (attempt ${probeAttempt})...\x1b[0m`);
            pushEvent("silent_rate_limit", `Probe returned 0 — proxy banned, waiting ${backoff/1000}s for rotation`);
            await new Promise(resolve => setTimeout(resolve, backoff));
          }

          break; // Window is done — exit the main pagination loop
        }

        const newTweets: NitterTweet[] = [];
        for (const t of pageTweets) {
          const parsed = parseNitterDate(t.date);
          if (!isNaN(parsed.getTime())) {
            if (!oldestDateInWindow || parsed < oldestDateInWindow) {
              oldestDateInWindow = parsed;
            }
          }

          const key = `${t.id}:${t.date}`;
          if (!seen.has(key)) {
            seen.add(key);
            newTweets.push(t);
            tweets.push(t);
            newInWindow++;
          }
        }

        // Only reset retries if we successfully got NEW tweets we haven't seen yet in this window
        // This prevents infinite loops where we restart the window and keep fetching the same first page
        if (newTweets.length > 0) {
          errorRetries = 0;
        }

        console.log(`\x1b[33m[Nitter] 🔍 Phase 2: Search page ${pagesFetched + 1}: ${pageTweets.length} tweets (${newTweets.length} new). Query: "${query}"\x1b[0m`);

        pagesFetched++;
        if (newTweets.length > 0 && onTweetsFetched) {
          await onTweetsFetched(newTweets);
        }

        const nextCursor = extractNextCursor($);
        if (!nextCursor || nextCursor === cursor) {
          if (oldestDateInWindow && oldestDateInWindow > currentSince) {
             const oldestStr = oldestDateInWindow.toISOString().split('T')[0];
             console.log(`\x1b[33m[Nitter] 🛑 Last page of pagination near ${oldestStr}. Resetting search window to bypass limit.\x1b[0m`);
             
             const newUntilDate = new Date(oldestDateInWindow);
             newUntilDate.setDate(newUntilDate.getDate() - 1);
             const newUntilStr = newUntilDate.toISOString().split('T')[0];
             
             if (newUntilStr >= currentSince.toISOString().split('T')[0]) {
                 untilStr = newUntilStr;
                 cursor = null;
             } else {
                 windowFinished = true;
             }
          } else {
             windowFinished = true;
          }
        } else {
          cursor = nextCursor;
        }
      } catch (e) {
        if (errorRetries < MAX_ERROR_RETRIES) {
          errorRetries++;
          const backoff = 5000 * Math.pow(2, errorRetries);
          console.log(`\x1b[31m[Nitter] ⚠️ Search request failed: ${e instanceof Error ? e.message : e}. Retrying in ${backoff/1000}s (attempt ${errorRetries}/${MAX_ERROR_RETRIES})...\x1b[0m`);
          await new Promise(resolve => setTimeout(resolve, backoff));
        } else {
          console.log(`\x1b[31m[Nitter] ❌ Search request permanently failed after ${MAX_ERROR_RETRIES} retries. Aborting archival search.\x1b[0m`);
          throw e;
        }
      }
    }

    // Recalculate rate based on this window's actual yield
    const actualDaysFetched = (currentUntil.getTime() - currentSince.getTime()) / (1000 * 60 * 60 * 24);
    if (newInWindow > 0) {
      rateDaysPerTweet = actualDaysFetched / newInWindow;
    } else {
      // If we found 0 tweets, heavily increase the rate to widen the next window
      rateDaysPerTweet *= 5;
    }

    currentUntil = new Date(currentSince);
  }

  return { tweets, pagesFetched };
}
