import { Suspense } from "react";
import {
  getProfileAnalysisContext,
} from "@/lib/mockData";
import ProfileHeader from "@/components/ProfileHeader";
import StatCard from "@/components/StatCard";
import TopicBar from "@/components/TopicBar";
import ActivityChart from "@/components/ActivityChart";
import AiClassificationPanel from "@/components/AiClassificationPanel";
import { exec } from "child_process";
import path from "path";
import util from "util";
import { Profile } from "@/types";

const execAsync = util.promisify(exec);

async function fetchRealProfile(username: string): Promise<Profile | null> {
  const sanitizedUsername = username.replace(/[^a-zA-Z0-9_]/g, "");
  const scriptPath = path.resolve(process.cwd(), "scripts", "x_profile_metadata.py");
  const command = `py "${scriptPath}" ${sanitizedUsername}`;

  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 45000 });
    if (stderr) console.log(`[Profile Scraper for ${sanitizedUsername}] ${stderr}`);

    const parsed = JSON.parse(stdout);
    if (parsed.status === "ok" && parsed.profile) {
      const p = parsed.profile;
      return {
        name: p.name || sanitizedUsername,
        handle: p.handle || sanitizedUsername,
        bio: p.bio || "",
        followers: p.followers || 0,
        following: p.following || 0,
        tweets: 0, // The script doesn't fetch tweet counts
        verified: p.verified || false,
        joinDate: p.join_date || "Unknown",
      };
    }
  } catch (err: any) {
    if (err.stderr) console.log(`[Profile Scraper Error] ${err.stderr}`);
    console.error(`Failed to fetch real profile for ${username}:`, err.message);
  }
  return null;
}

async function fetchRealTweets(username: string): Promise<any[]> {
  const sanitizedUsername = username.replace(/[^a-zA-Z0-9_]/g, "");
  const scriptPath = path.resolve(process.cwd(), "scripts", "x_eval_tweets.py");
  const command = `py "${scriptPath}" ${sanitizedUsername}`;

  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 60000, maxBuffer: 1024 * 1024 * 10 });
    if (stderr) console.log(`[Tweets Scraper for ${sanitizedUsername}] ${stderr}`);

    const parsed = JSON.parse(stdout);
    if (parsed.status === "ok" && parsed.tweets) {
      return parsed.tweets;
    }
  } catch (err: any) {
    if (err.stderr) console.log(`[Tweets Scraper Error] ${err.stderr}`);
    console.error(`Failed to fetch real tweets for ${username}:`, err.message);
  }
  return [];
}

async function AiPanelWithTweets({ username, bio, tweetsPromise }: { username: string, bio: string, tweetsPromise: Promise<any[]> }) {
  const tweets = await tweetsPromise;
  return <AiClassificationPanel username={username} bio={bio} initialTweets={tweets} />;
}

function PanelSkeleton() {
  return (
    <div className="surface" style={{ padding: "24px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 560, marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>AI Classification</h2>
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          Generate an on-demand AI reading of this profile's likely position on the
          Indian ideological spectrum using the profile signals, X-style post data, and
          dashboard evidence shown above.
        </p>
      </div>
      <div className="surface-subtle" style={{ padding: "16px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 14,
              height: 14,
              border: "2px solid var(--accent)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <p style={{ fontSize: 14, color: "var(--text-primary)", margin: 0 }}>
            Running Playwright Scraper to fetch recent tweets... (this may take up to 60s)
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

export default async function ProfileDashboard({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const username = (await params).username;

  // Start BOTH scripts immediately (but do not wait for tweets yet)
  const profilePromise = fetchRealProfile(username);
  const tweetsPromise = fetchRealTweets(username);

  // Wait ONLY for the profile, so the page layout can render instantly!
  const realProfile = await profilePromise;

  // Get mock context for the other widgets
  const context = getProfileAnalysisContext(username);
  const {
    profile: mockProfile,
    activityStats,
    topics,
    activityTimeline,
  } = context;

  // Use real if available, else mock
  const profile = realProfile || mockProfile;

  // Since stats, topics and timeline are currently mock, make them "-" per user request
  const sanitizedActivityStats = activityStats.map(stat => ({
    ...stat,
    value: "-"
  }));

  const sanitizedTopics = topics.map(topic => ({
    ...topic,
    percentage: 0 // We'll update component to display "-" if 0 or similar
  }));

  const sanitizedActivityTimeline = activityTimeline.map(point => ({
    ...point,
    value: 0
  }));

  return (
    <div className="page-container" style={{ padding: "40px 24px 80px" }}>
      {/* 1. Header Section */}
      <ProfileHeader profile={profile} />

      {/* 2. Activity Overview Grid */}
      <div style={{ marginBottom: 40 }}>
        <h2 className="section-title">Activity Overview</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {sanitizedActivityStats.map((stat, i) => (
            <StatCard key={i} stat={stat} />
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          marginBottom: 40,
        }}
      >
        {/* 3. Topic Analysis */}
        <div className="surface" style={{ padding: "24px", gridColumn: "1 / -1" }}>
          <h2 className="section-title" style={{ marginBottom: 20 }}>
            Topic Concentration
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {sanitizedTopics.map((t, i) => (
              <TopicBar key={i} topic={t} rank={i + 1} />
            ))}
          </div>
        </div>

        {/* 4. Activity Chart */}
        <div style={{ gridColumn: "1 / -1" }}>
          <ActivityChart data={sanitizedActivityTimeline} />
        </div>

      </div>
      <div style={{ marginTop: 40 }}>
        <Suspense fallback={<PanelSkeleton />}>
          <AiPanelWithTweets username={profile.handle} bio={profile.bio} tweetsPromise={tweetsPromise} />
        </Suspense>
      </div>
    </div>
  );
}
