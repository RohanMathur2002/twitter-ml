export type Profile = {
  name: string;
  handle: string;
  bio: string;
  followers: number;
  following: number;
  tweets: number;
  verified: boolean;
  joinDate: string;
};

export type Topic = {
  name: string;
  percentage: number;
  trend: "up" | "down" | "neutral";
  keywords: string[];
};

export type ActivityStat = {
  label: string;
  value: string;
  sub?: string;
};

export type ActivityDataPoint = {
  label: string;
  value: number;
};

export type PoliticalVerdict = {
  verdict: string;
  confidence: number;
  breakdown: { label: string; description: string }[];
};

export type XUserPublicMetrics = {
  followers_count: number;
  following_count: number;
  tweet_count: number;
  listed_count: number;
};

export type XUser = {
  id: string;
  name: string;
  username: string;
  created_at: string;
  description: string;
  location?: string;
  profile_image_url?: string;
  verified: boolean;
  verified_type?: string;
  protected: boolean;
  public_metrics: XUserPublicMetrics;
};

export type XTweetPublicMetrics = {
  retweet_count: number;
  reply_count: number;
  like_count: number;
  quote_count: number;
  bookmark_count: number;
  impression_count: number;
};

export type XTweetReferenced = {
  type: "retweeted" | "quoted" | "replied_to";
  id: string;
};

export type XContextAnnotation = {
  domain: {
    id: string;
    name: string;
    description: string;
  };
  entity: {
    id: string;
    name: string;
    description?: string;
  };
};

export type XTweet = {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  conversation_id: string;
  edit_history_tweet_ids: string[];
  lang: string;
  possibly_sensitive: boolean;
  reply_settings: "everyone" | "mentionedUsers" | "followers";
  public_metrics: XTweetPublicMetrics;
  referenced_tweets?: XTweetReferenced[];
  context_annotations?: XContextAnnotation[];
};

export type MockProfileRecord = {
  user: XUser;
  posts: XTweet[];
  activityStats: ActivityStat[];
  topics: Topic[];
  activityTimeline: ActivityDataPoint[];
  politicalVerdict: PoliticalVerdict;
};

export type ProfileAnalysisContext = {
  user: XUser;
  posts: XTweet[];
  profile: Profile;
  activityStats: ActivityStat[];
  topics: Topic[];
  activityTimeline: ActivityDataPoint[];
  politicalVerdict: PoliticalVerdict;
};
