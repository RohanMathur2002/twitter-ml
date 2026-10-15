import type { PoolClient } from "pg";
import { query } from "@/lib/db";
import type { NitterProfile } from "./nitterService";

export interface DbProfile {
  id: number;
  username: string;
  display_name: string | null;
  bio: string | null;
  followers_count: string;
  following_count: string;
  tweet_count: string;
  verified: boolean;
  profile_image_url: string | null;
  location: string | null;
  account_created_at: string | null;
  scraped_at: string;
  raw_profile_json: unknown;
}

function parseCount(value: string) {
  const normalized = value.replace(/[^\d]/g, "");
  return normalized ? Number(normalized) : 0;
}

function parseJoined(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function upsertProfile(client: PoolClient, profile: NitterProfile) {
  const result = await client.query<{ id: number }>(
    `
      INSERT INTO profiles (
        username,
        display_name,
        bio,
        followers_count,
        following_count,
        tweet_count,
        verified,
        profile_image_url,
        location,
        account_created_at,
        scraped_at,
        raw_profile_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), $11)
      ON CONFLICT (lower(username)) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        bio = EXCLUDED.bio,
        followers_count = EXCLUDED.followers_count,
        following_count = EXCLUDED.following_count,
        tweet_count = EXCLUDED.tweet_count,
        verified = EXCLUDED.verified,
        profile_image_url = EXCLUDED.profile_image_url,
        location = EXCLUDED.location,
        account_created_at = COALESCE(EXCLUDED.account_created_at, profiles.account_created_at),
        scraped_at = now(),
        raw_profile_json = EXCLUDED.raw_profile_json
      RETURNING id
    `,
    [
      profile.username.replace("@", "").toLowerCase(),
      profile.name,
      profile.bio,
      parseCount(profile.stats.followers),
      parseCount(profile.stats.following),
      parseCount(profile.stats.tweets),
      false,
      profile.avatar || null,
      profile.location || null,
      parseJoined(profile.joined),
      profile,
    ]
  );

  return result.rows[0].id;
}

export async function getProfileByUsername(username: string) {
  const result = await query<DbProfile>(
    `
      SELECT *
      FROM profiles
      WHERE lower(username) = lower($1)
      LIMIT 1
    `,
    [username.replace("@", "")]
  );

  return result.rows[0] || null;
}

export async function getAllProfiles() {
  const result = await query<DbProfile>(
    `
      SELECT id, username, display_name, profile_image_url, followers_count
      FROM profiles
      ORDER BY username ASC
    `
  );
  return result.rows;
}

