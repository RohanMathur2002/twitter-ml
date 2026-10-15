"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import InputForm from "@/components/InputForm";

export default function Home() {
  const [history, setHistory] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    const historyStr = localStorage.getItem("search_history");
    if (historyStr) {
      try {
        const parsed = JSON.parse(historyStr) as string[];
        setHistory(parsed.slice(0, 5));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const handleHistoryClick = (handle: string) => {
    router.push(`/profile?username=${handle}`);
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div
          className="surface"
          style={{
            width: "100%",
            maxWidth: 440,
            padding: "40px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h1
              style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em" }}
            >
              Analyze Profile
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 280, margin: "0 auto" }}>
              Enter a Twitter/X handle to generate an analytical intelligence dossier.
            </p>
          </div>

          <InputForm />

          {history.length > 0 && (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Recent History
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
              </div>
              
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {history.map((handle) => (
                  <button
                    key={handle}
                    onClick={() => handleHistoryClick(handle)}
                    className="chip"
                    style={{ 
                      background: "transparent", 
                      border: "1px solid var(--border)", 
                      cursor: "pointer",
                      padding: "6px 12px",
                      borderRadius: "16px",
                      fontSize: "12px",
                      color: "var(--text-primary)",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent)";
                      e.currentTarget.style.color = "var(--accent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                  >
                    @{handle}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
