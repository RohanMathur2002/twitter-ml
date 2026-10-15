"use client";

import { MapPin, Link as LinkIcon, Calendar } from "lucide-react";
import type { NitterProfile as ProfileType } from "@/app/actions/nitter";
import styles from "./Nitter.module.css";

const DEFAULT_PROFILE_AVATAR =
  "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png";

interface NitterProfileProps {
  profile: ProfileType;
}

export function NitterProfile({ profile }: NitterProfileProps) {
  return (
    <div className={styles.profileCard}>
      <div className={styles.profileBody}>
        <div className={styles.profileTop}>
          <div className={styles.avatarWrap}>
            <img
              src={profile.avatar || DEFAULT_PROFILE_AVATAR}
              alt={profile.name}
              className={styles.avatar}
              onError={(e) => {
                e.currentTarget.src = DEFAULT_PROFILE_AVATAR;
              }}
            />
          </div>
          <div className={styles.identity}>
            <h2 className={styles.name}>{profile.name}</h2>
            <p className={styles.username}>{profile.username}</p>
          </div>
          <a
            href={`https://x.com/${profile.username.replace("@", "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.externalLink}
          >
            View on X
          </a>
        </div>

        {profile.bio && (
          <p className={styles.bio}>{profile.bio}</p>
        )}

        <div className={styles.meta}>
          {profile.location && (
            <span className={styles.metaItem}>
              <MapPin size={15} />
              {profile.location}
            </span>
          )}
          {profile.website.url && (
            <a
              href={profile.website.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.metaItem}
            >
              <LinkIcon size={15} />
              {profile.website.text || "Website"}
            </a>
          )}
          {profile.joined && (
            <span className={styles.metaItem}>
              <Calendar size={15} />
              Joined {profile.joined}
            </span>
          )}
        </div>

        <div className={styles.stats}>
          {[
            { label: "Tweets", value: profile.stats.tweets },
            { label: "Following", value: profile.stats.following },
            { label: "Followers", value: profile.stats.followers },
            { label: "Likes", value: profile.stats.likes },
          ].map((s) => (
            <div key={s.label} className={styles.stat}>
              <span className={styles.statValue}>{s.value}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
