import { Profile } from "@/types";

interface Props {
  profile: Profile;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}


export default function ProfileHeader({ profile }: Props) {

  return (
    <div
      className="surface"
      style={{ padding: "28px 32px", marginBottom: 24 }}
    >
      <div
        style={{
          display: "flex",
          gap: 24,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 2,
            }}
          >
            <h1
              style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em" }}
            >
              {profile.name}
            </h1>
            {profile.verified && (
              <span
                title="Verified account"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-label="Verified"
                >
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="#fff"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
          </div>

          {/* Handle */}
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              marginBottom: 10,
            }}
          >
            @{profile.handle}
          </p>

          {/* Bio */}
          <p
            style={{
              fontSize: 13.5,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              maxWidth: 560,
              marginBottom: 16,
            }}
          >
            {profile.bio}
          </p>

          {/* Stats row */}
          <div
            style={{
              display: "flex",
              gap: 24,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <StatPill label="Followers" value={formatNumber(profile.followers)} />
            <StatPill label="Following" value={formatNumber(profile.following)} />
            <StatPill label="Tweets" value={formatNumber(profile.tweets)} />
            <span
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginLeft: "auto",
              }}
            >
              Joined {profile.joinDate}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
        {label}
      </span>
    </div>
  );
}
