import { query } from "@/lib/db";
import { mapLocationToCountry } from "@/lib/countries";

export interface KeywordSearchResult {
  keyword: string;
  stats: {
    total_tweets: number;
    unique_profiles: number;
    total_likes: number;
    total_retweets: number;
    total_replies: number;
    avg_engagement: number;
    first_seen: string | null;
    last_seen: string | null;
  };
  topHashtags: Array<{
    hashtag: string;
    count: number;
  }>;
  topProfiles: Array<{
    username: string;
    display_name: string | null;
    profile_image_url: string | null;
    tweet_count: number;
    country?: string | null;
  }>;
  tweets: Array<{
    id: string;
    raw_text: string;
    clean_text: string | null;
    created_at: string;
    likes_count: string;
    retweets_count: string;
    replies_count: string;
    views_count: string | null;
    is_retweet: boolean;
    hashtags: string[];
    mentions: string[];
    urls: string[];
    username: string;
    display_name: string | null;
    profile_image_url: string | null;
  }>;
  total: number;
  page: number;
  limit: number;
  timeline: Array<{
    period: string;
    tweet_count: number;
    likes: number;
    retweets: number;
    replies: number;
  }>;
  topMentions: Array<{
    mention: string;
    count: number;
  }>;
  countryDistribution?: Array<{
    country: string;
    count: number;
  }>;
}

export async function searchKeywords(
  keywordInput: string,
  page = 1,
  limit = 25,
  mode: "live" | "db" = "live"
): Promise<KeywordSearchResult> {
  const keyword = keywordInput.trim();
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const offset = Math.max(page - 1, 0) * safeLimit;

  const likePattern = `%${keyword}%`;
  const cleanTag = keyword.replace(/^#/, "");

  // 1. Fetch aggregate statistics
  const statsQuery = mode === "live" ? `
    SELECT
      COUNT(*)::bigint AS total_tweets,
      COUNT(DISTINCT t.profile_id)::bigint AS unique_profiles,
      COALESCE(SUM(t.likes_count), 0)::bigint AS total_likes,
      COALESCE(SUM(t.retweets_count), 0)::bigint AS total_retweets,
      COALESCE(SUM(t.replies_count), 0)::bigint AS total_replies,
      COALESCE(AVG(t.likes_count + t.retweets_count + t.replies_count), 0)::numeric(10,1) AS avg_engagement,
      MIN(t.created_at) AS first_seen,
      MAX(t.created_at) AS last_seen
    FROM tweets t
    JOIN tweet_keywords tk ON tk.tweet_id = t.id
    WHERE tk.keyword = $1
  ` : `
    SELECT
      COUNT(*)::bigint AS total_tweets,
      COUNT(DISTINCT t.profile_id)::bigint AS unique_profiles,
      COALESCE(SUM(t.likes_count), 0)::bigint AS total_likes,
      COALESCE(SUM(t.retweets_count), 0)::bigint AS total_retweets,
      COALESCE(SUM(t.replies_count), 0)::bigint AS total_replies,
      COALESCE(AVG(t.likes_count + t.retweets_count + t.replies_count), 0)::numeric(10,1) AS avg_engagement,
      MIN(t.created_at) AS first_seen,
      MAX(t.created_at) AS last_seen
    FROM tweets t
    WHERE t.raw_text ILIKE $1
       OR t.clean_text ILIKE $1
       OR EXISTS (
         SELECT 1 FROM unnest(t.hashtags) h WHERE h ILIKE $2
       )
  `;

  const statsRes = await query(statsQuery, mode === "live" ? [keyword] : [likePattern, cleanTag]);
  const statsRow = statsRes.rows[0] || {};
  const totalTweets = Number(statsRow.total_tweets || 0);

  // 2. Fetch paginated tweets with profile info
  const tweetsQuery = mode === "live" ? `
    SELECT 
      t.id, t.raw_text, t.clean_text, t.created_at, t.likes_count, t.retweets_count,
      t.replies_count, t.views_count, t.is_retweet, t.hashtags, t.mentions, t.urls,
      p.username, p.display_name, p.profile_image_url
    FROM tweets t
    JOIN profiles p ON p.id = t.profile_id
    JOIN tweet_keywords tk ON tk.tweet_id = t.id
    WHERE tk.keyword = $1
    ORDER BY t.created_at DESC
    LIMIT $2 OFFSET $3
  ` : `
    SELECT 
      t.id, t.raw_text, t.clean_text, t.created_at, t.likes_count, t.retweets_count,
      t.replies_count, t.views_count, t.is_retweet, t.hashtags, t.mentions, t.urls,
      p.username, p.display_name, p.profile_image_url
    FROM tweets t
    JOIN profiles p ON p.id = t.profile_id
    WHERE t.raw_text ILIKE $1
       OR t.clean_text ILIKE $1
       OR EXISTS (
         SELECT 1 FROM unnest(t.hashtags) h WHERE h ILIKE $2
       )
    ORDER BY t.created_at DESC
    LIMIT $3 OFFSET $4
  `;
  const tweetsRes = await query(tweetsQuery, mode === "live" ? [keyword, safeLimit, offset] : [likePattern, cleanTag, safeLimit, offset]);

  // 3. Fetch top co-occurring hashtags
  const hashtagsQuery = mode === "live" ? `
    SELECT h AS hashtag, COUNT(*)::bigint AS count
    FROM tweets t
    JOIN tweet_keywords tk ON tk.tweet_id = t.id,
    unnest(t.hashtags) h
    WHERE tk.keyword = $1
    AND lower(h) <> lower($2)
    GROUP BY h
    ORDER BY count DESC
    LIMIT 10
  ` : `
    SELECT h AS hashtag, COUNT(*)::bigint AS count
    FROM tweets t, unnest(t.hashtags) h
    WHERE (
      t.raw_text ILIKE $1
      OR t.clean_text ILIKE $1
      OR EXISTS (SELECT 1 FROM unnest(t.hashtags) tag WHERE tag ILIKE $2)
    )
    AND lower(h) <> lower($2)
    GROUP BY h
    ORDER BY count DESC
    LIMIT 10
  `;
  const hashtagsRes = await query(hashtagsQuery, mode === "live" ? [keyword, cleanTag] : [likePattern, cleanTag]);

  // 4. Fetch top active profiles for this keyword
  const profilesQuery = mode === "live" ? `
    SELECT 
      p.username,
      p.display_name,
      p.profile_image_url,
      p.location,
      COUNT(*)::bigint AS tweet_count
    FROM tweets t
    JOIN profiles p ON p.id = t.profile_id
    JOIN tweet_keywords tk ON tk.tweet_id = t.id
    WHERE tk.keyword = $1
    GROUP BY p.id, p.username, p.display_name, p.profile_image_url, p.location
    ORDER BY tweet_count DESC
    LIMIT 8
  ` : `
    SELECT 
      p.username,
      p.display_name,
      p.profile_image_url,
      p.location,
      COUNT(*)::bigint AS tweet_count
    FROM tweets t
    JOIN profiles p ON p.id = t.profile_id
    WHERE t.raw_text ILIKE $1
       OR t.clean_text ILIKE $1
       OR EXISTS (
         SELECT 1 FROM unnest(t.hashtags) h WHERE h ILIKE $2
       )
    GROUP BY p.id, p.username, p.display_name, p.profile_image_url, p.location
    ORDER BY tweet_count DESC
    LIMIT 8
  `;
  const profilesRes = await query(profilesQuery, mode === "live" ? [keyword] : [likePattern, cleanTag]);

  // 5. Fetch timeline data (last 30 days of activity for this keyword)
  const timelineQuery = mode === "live" ? `
    SELECT 
      date_trunc('day', t.created_at) AS period,
      COUNT(*)::bigint AS tweet_count,
      COALESCE(SUM(t.likes_count), 0)::bigint AS likes,
      COALESCE(SUM(t.retweets_count), 0)::bigint AS retweets,
      COALESCE(SUM(t.replies_count), 0)::bigint AS replies
    FROM tweets t
    JOIN tweet_keywords tk ON tk.tweet_id = t.id
    WHERE tk.keyword = $1
    GROUP BY period
    ORDER BY period ASC
    LIMIT 30
  ` : `
    SELECT 
      date_trunc('day', t.created_at) AS period,
      COUNT(*)::bigint AS tweet_count,
      COALESCE(SUM(t.likes_count), 0)::bigint AS likes,
      COALESCE(SUM(t.retweets_count), 0)::bigint AS retweets,
      COALESCE(SUM(t.replies_count), 0)::bigint AS replies
    FROM tweets t
    WHERE t.raw_text ILIKE $1
       OR t.clean_text ILIKE $1
       OR EXISTS (
         SELECT 1 FROM unnest(t.hashtags) h WHERE h ILIKE $2
       )
    GROUP BY period
    ORDER BY period ASC
    LIMIT 30
  `;
  const timelineRes = await query(timelineQuery, mode === "live" ? [keyword] : [likePattern, cleanTag]);

  // 6. Fetch top mentions
  const mentionsQuery = mode === "live" ? `
    SELECT m AS mention, COUNT(*)::bigint AS count
    FROM tweets t
    JOIN tweet_keywords tk ON tk.tweet_id = t.id,
    unnest(t.mentions) m
    WHERE tk.keyword = $1
    GROUP BY m
    ORDER BY count DESC
    LIMIT 10
  ` : `
    SELECT m AS mention, COUNT(*)::bigint AS count
    FROM tweets t, unnest(t.mentions) m
    WHERE (
      t.raw_text ILIKE $1
      OR t.clean_text ILIKE $1
      OR EXISTS (SELECT 1 FROM unnest(t.hashtags) tag WHERE tag ILIKE $2)
    )
    GROUP BY m
    ORDER BY count DESC
    LIMIT 10
  `;
  const mentionsRes = await query(mentionsQuery, mode === "live" ? [keyword] : [likePattern, cleanTag]);

  // 7. Fetch Country distribution
  const countryQuery = mode === "live" ? `
    SELECT 
      p.location,
      COUNT(DISTINCT p.id)::bigint AS profile_count
    FROM tweets t
    JOIN profiles p ON p.id = t.profile_id
    JOIN tweet_keywords tk ON tk.tweet_id = t.id
    WHERE tk.keyword = $1
    AND p.location IS NOT NULL
    GROUP BY p.location
  ` : `
    SELECT 
      p.location,
      COUNT(DISTINCT p.id)::bigint AS profile_count
    FROM tweets t
    JOIN profiles p ON p.id = t.profile_id
    WHERE (
      t.raw_text ILIKE $1
      OR t.clean_text ILIKE $1
      OR EXISTS (SELECT 1 FROM unnest(t.hashtags) tag WHERE tag ILIKE $2)
    )
    AND p.location IS NOT NULL
    GROUP BY p.location
  `;
  const countryRes = await query(countryQuery, mode === "live" ? [keyword] : [likePattern, cleanTag]);
  
  const countryDistributionMap = new Map<string, number>();
  countryRes.rows.forEach(row => {
    const loc = String(row.location);
    const country = mapLocationToCountry(loc);
    if (country) {
      countryDistributionMap.set(country, (countryDistributionMap.get(country) || 0) + Number(row.profile_count));
    }
  });

  const countryDistribution = Array.from(countryDistributionMap.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    keyword,
    stats: {
      total_tweets: totalTweets,
      unique_profiles: Number(statsRow.unique_profiles || 0),
      total_likes: Number(statsRow.total_likes || 0),
      total_retweets: Number(statsRow.total_retweets || 0),
      total_replies: Number(statsRow.total_replies || 0),
      avg_engagement: Number(statsRow.avg_engagement || 0),
      first_seen: statsRow.first_seen ? new Date(statsRow.first_seen).toISOString() : null,
      last_seen: statsRow.last_seen ? new Date(statsRow.last_seen).toISOString() : null,
    },
    topHashtags: hashtagsRes.rows.map((row) => ({
      hashtag: String(row.hashtag),
      count: Number(row.count || 0),
    })),
    topProfiles: profilesRes.rows.map((row) => {
      let country = null;
      if (row.location) {
        country = mapLocationToCountry(String(row.location));
      }
      return {
        username: String(row.username),
        display_name: row.display_name ? String(row.display_name) : null,
        profile_image_url: row.profile_image_url ? String(row.profile_image_url) : null,
        tweet_count: Number(row.tweet_count || 0),
        country: country,
      };
    }),
    tweets: tweetsRes.rows.map((r) => ({
      id: String(r.id),
      raw_text: String(r.raw_text || ""),
      clean_text: r.clean_text ? String(r.clean_text) : null,
      created_at: String(r.created_at),
      likes_count: String(r.likes_count || "0"),
      retweets_count: String(r.retweets_count || "0"),
      replies_count: String(r.replies_count || "0"),
      views_count: r.views_count ? String(r.views_count) : null,
      is_retweet: Boolean(r.is_retweet),
      hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
      mentions: Array.isArray(r.mentions) ? r.mentions : [],
      urls: Array.isArray(r.urls) ? r.urls : [],
      username: String(r.username || ""),
      display_name: r.display_name ? String(r.display_name) : null,
      profile_image_url: r.profile_image_url ? String(r.profile_image_url) : null,
    })),
    total: totalTweets,
    page,
    limit: safeLimit,
    timeline: timelineRes.rows.map((row) => ({
      period: row.period ? new Date(row.period).toISOString() : new Date().toISOString(),
      tweet_count: Number(row.tweet_count || 0),
      likes: Number(row.likes || 0),
      retweets: Number(row.retweets || 0),
      replies: Number(row.replies || 0),
    })),
    topMentions: mentionsRes.rows.map((row) => ({
      mention: String(row.mention),
      count: Number(row.count || 0),
    })),
    countryDistribution,
  };
}

export async function deleteKeywordData(keywordInput: string): Promise<number> {
  const keyword = keywordInput.trim();
  const res = await query('DELETE FROM tweet_keywords WHERE keyword = $1', [keyword]);
  return res.rowCount || 0;
}
