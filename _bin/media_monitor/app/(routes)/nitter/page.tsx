"use client";

import { useState } from "react";
import { Search, AlertCircle, Loader2 } from "lucide-react";
import { getNitterProfile, type NitterProfile as ProfileType } from "@/app/actions/nitter";
import { NitterProfile } from "@/components/nitter/NitterProfile";
import { NitterTimeline } from "@/components/nitter/NitterTimeline";
import styles from "@/components/nitter/Nitter.module.css";

export default function NitterPage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    setError(null);
    setProfile(null);

    try {
      const data = await getNitterProfile(username);
      if (data && data.name) {
        setProfile(data);
      } else {
        setError("Could not find profile or Nitter is currently unavailable.");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.panel}>
          <form onSubmit={handleSearch} className={styles.searchForm}>
            <div className={styles.searchField}>
              <div className={styles.searchIcon}>
                <Search />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username (e.g. DrNimoYadav)"
                className={styles.searchInput}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !username.trim()}
              className={styles.searchButton}
            >
              {loading ? <Loader2 className={styles.spin} /> : "Search"}
            </button>
          </form>
        </div>

        {error && (
          <div className={styles.error}>
            <AlertCircle size={18} />
            <p>{error}</p>
          </div>
        )}

        {loading && !profile && (
          <div className={styles.loadingStack}>
            <div className={styles.skeletonLarge} />
            <div className={styles.skeletonSmall} />
            <div className={styles.skeletonSmall} />
          </div>
        )}

        {profile && (
          <div className={styles.stack}>
            <NitterProfile profile={profile} />

            <div className={styles.divider}>
              <span>Timeline</span>
            </div>

            <NitterTimeline
              initialTweets={profile.tweets}
              initialCursor={profile.cursor}
              username={username}
            />
          </div>
        )}
      </div>
    </div>
  );
}
