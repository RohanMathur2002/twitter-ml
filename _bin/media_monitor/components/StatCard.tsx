import { ActivityStat } from "@/types";

interface Props {
  stat: ActivityStat;
}

export default function StatCard({ stat }: Props) {
  return (
    <div
      className="surface transition-surface surface-hover"
      style={{
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: "default",
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        {stat.label}
      </p>
      <p
        style={{
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: "var(--text-primary)",
          lineHeight: 1.1,
        }}
      >
        {stat.value}
      </p>
      {stat.sub && (
        <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{stat.sub}</p>
      )}
    </div>
  );
}
