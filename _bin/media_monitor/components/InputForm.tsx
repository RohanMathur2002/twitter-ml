"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function InputForm() {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Please enter a Twitter/X handle or profile URL.");
      return;
    }

    // Extract username from URL or @handle
    let username = trimmed;
    if (username.includes("twitter.com/") || username.includes("x.com/")) {
      const parts = username.split("/").filter(Boolean);
      username = parts[parts.length - 1].split("?")[0];
    }
    username = username.replace(/^@/, "");

    if (!/^[a-zA-Z0-9_]{1,50}$/.test(username)) {
      setError("Invalid handle. Only letters, numbers, and underscores allowed.");
      return;
    }

    setError("");

    // Save to history in localStorage
    try {
      const historyStr = localStorage.getItem("search_history");
      let history: string[] = historyStr ? JSON.parse(historyStr) : [];
      // Remove if exists to re-insert at top
      history = [username, ...history.filter((h) => h !== username)].slice(0, 10);
      localStorage.setItem("search_history", JSON.stringify(history));
    } catch (e) {
      console.error("Failed to save history", e);
    }

    router.push(`/profile?username=${username}`);
  };

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        <div style={{ position: "relative" }}>
          {/* @ prefix */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
              fontSize: 15,
              fontWeight: 500,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            @
          </span>
          <input
            id="username-input"
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError("");
            }}
            placeholder="handle or x.com/username"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{
              width: "100%",
              paddingLeft: 32,
              paddingRight: 16,
              paddingTop: 12,
              paddingBottom: 12,
              fontSize: 15,
              border: `1px solid ${error ? "var(--down)" : "var(--border)"}`,
              borderRadius: 8,
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              outline: "none",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.boxShadow =
                "0 0 0 3px var(--accent-muted)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = error
                ? "var(--down)"
                : "var(--border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        {error && (
          <p
            role="alert"
            style={{ fontSize: 12, color: "var(--down)", marginTop: -4 }}
          >
            {error}
          </p>
        )}

        <button
          id="analyze-button"
          type="submit"
          style={{
            padding: "11px 24px",
            fontSize: 14,
            fontWeight: 600,
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            letterSpacing: "-0.01em",
            transition: "opacity 0.15s ease",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.opacity = "0.88")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.opacity = "1")
          }
        >
          Analyze Profile
        </button>
      </div>
    </form>
  );
}
