export default function Loading() {
  return (
    <div className="page-container" style={{ padding: "40px 24px 80px" }}>
      {/* Header Skeleton */}
      <div
        className="surface"
        style={{
          padding: "28px 32px",
          marginBottom: 24,
          display: "flex",
          gap: 24,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "var(--bg-subtle)",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              width: 140,
              height: 24,
              background: "var(--bg-subtle)",
              borderRadius: 4,
              marginBottom: 12,
              animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
          <div
            style={{
              width: "80%",
              height: 16,
              background: "var(--bg-subtle)",
              borderRadius: 4,
              marginBottom: 8,
              animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
          <div
            style={{
              width: "60%",
              height: 16,
              background: "var(--bg-subtle)",
              borderRadius: 4,
              marginBottom: 24,
              animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
      `}</style>
    </div>
  );
}
