import { ActivityDataPoint } from "@/types";

interface Props {
  data: ActivityDataPoint[];
}

export default function ActivityChart({ data }: Props) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div
      className="surface"
      style={{
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          Activity Timeline
        </h2>
        <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.02em" }}>
          Posts over last 12 months
        </span>
      </div>

      {data.every(d => d.value === 0) ? (
        <div style={{ 
          height: 140, 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center",
          fontSize: 24,
          color: "var(--text-muted)",
          fontWeight: 600
        }}>
          -
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            height: 140,
            gap: 6,
            paddingTop: 10,
          }}
        >
          {data.map((point, index) => {
            const heightPct = Math.max((point.value / max) * 100, 4);
            return (
              <div
                key={index}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  flex: 1,
                }}
                title={`${point.label}: ${point.value} posts`}
              >
                <div
                  className="chart-bar"
                  style={{
                    width: "100%",
                    maxWidth: 24,
                    height: `${heightPct}%`,
                    background: "var(--bar-1)",
                    borderRadius: "3px 3px 0 0",
                    opacity: 0.85,
                    transition: "opacity 0.15s ease",
                    cursor: "crosshair",
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    userSelect: "none",
                  }}
                >
                  {point.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
