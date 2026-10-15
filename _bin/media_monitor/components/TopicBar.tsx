import { Topic } from "@/types";

interface Props {
  topic: Topic;
  rank: number;
}

const TREND_CONFIG = {
  up: { icon: "Up", color: "var(--up)" },
  down: { icon: "Down", color: "var(--down)" },
  neutral: { icon: "Flat", color: "var(--neutral)" },
};

export default function TopicBar({ topic, rank }: Props) {
  const trend = TREND_CONFIG[topic.trend];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "14px 0",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-muted)",
              width: 16,
              textAlign: "right",
              flexShrink: 0,
            }}
          >
            {rank}
          </span>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {topic.name}
          </span>
          {/* <span
            aria-label={`Trend: ${topic.trend}`}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: trend.color,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            {trend.icon}
          </span> */}
        </div>
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
            flexShrink: 0,
          }}
        >
          {topic.percentage > 0 ? `${topic.percentage}%` : "-"}
        </span>
      </div>

      <div
        style={{
          height: 5,
          borderRadius: 3,
          background: "var(--bg-subtle)",
          marginLeft: 26,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${topic.percentage}%`,
            background: "var(--accent)",
            borderRadius: 3,
            opacity: 0.75 + rank * 0.04,
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginLeft: 26,
        }}
      >
        {topic.keywords.map((kw) => (
          <span key={kw} className="chip">
            {kw}
          </span>
        ))}
      </div>
    </div>
  );
}
