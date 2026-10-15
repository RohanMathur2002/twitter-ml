"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Database,
  Trash2,
  CheckCircle2,
  Loader2,
  Search,
  UserX,
  Bug,
  ListChecks,
  Activity,
  Clock,
  Globe,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
  XCircle,
  Zap
} from "lucide-react";

type Status = "idle" | "confirming" | "loading" | "success" | "error";
type Tab = "delete" | "check" | "nitter";

// ─── Nitter Health Types ──────────────────────────────────────────────────────
interface SessionStatus {
  id: string;
  status: "healthy" | "limited" | "exhausted";
  pending: number;
  apis: Record<string, { remaining: number; reset: number; resetIn: string }>;
}

interface ProxyHealth {
  status: "healthy" | "degraded" | "down" | "unknown";
  latencyMs: number | null;
  lastChecked: string | null;
  error: string | null;
  consecutiveFailures: number;
}

interface HealthSnapshot {
  timestamp: string;
  sessions: {
    total: number;
    healthy: number;
    limited: number;
    exhausted: number;
    details: SessionStatus[];
  };
  proxy: ProxyHealth;
  requests: { total: number; apis: Record<string, number> };
  nitterReachable: boolean;
}

interface CircuitBreakerState {
  consecutiveFailures: number;
  state: "closed" | "open" | "half-open";
  openedAt: number | null;
  lastError: string | null;
}

interface RequestStats {
  total: number;
  successes: number;
  failures: number;
  rateLimits: number;
  rpm: number;
}

interface HealthEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

interface HealthData {
  snapshot: HealthSnapshot | null;
  circuitBreaker: CircuitBreakerState;
  requestStats: RequestStats;
  events: HealthEvent[];
  monitoring: boolean;
}

// ─── Nitter Health Helpers ────────────────────────────────────────────────────
function timeAgo(ts: string | null): string {
  if (!ts) return "never";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function statusColor(status: string): string {
  switch (status) {
    case "healthy": case "closed": return "#3fb950";
    case "degraded": case "half-open": return "#d29922";
    case "down": case "open": return "#f85149";
    case "limited": return "#d29922";
    case "exhausted": return "#f85149";
    default: return "#8b949e";
  }
}

function statusBg(status: string): string {
  switch (status) {
    case "healthy": case "closed": return "rgba(63,185,80,0.12)";
    case "degraded": case "half-open": return "rgba(210,153,34,0.12)";
    case "down": case "open": return "rgba(248,81,73,0.12)";
    case "limited": return "rgba(210,153,34,0.12)";
    case "exhausted": return "rgba(248,81,73,0.12)";
    default: return "rgba(139,148,158,0.12)";
  }
}

function StatusDot({ status }: { status: string }) {
  const color = statusColor(status);
  const isPulse = status === "healthy" || status === "closed";
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
      <span style={{
        display: "block", width: 10, height: 10, borderRadius: "50%",
        background: color,
        boxShadow: isPulse ? `0 0 0 0 ${color}` : "none",
        animation: isPulse ? "pulse-dot 2s infinite" : "none",
      }} />
    </span>
  );
}

function EventIcon({ type }: { type: string }) {
  const size = 14;
  if (type.includes("limited") || type.includes("limit")) return <AlertTriangle size={size} color="#d29922" />;
  if (type.includes("recovered")) return <CheckCircle2 size={size} color="#3fb950" />;
  if (type.includes("down") || type.includes("open")) return <XCircle size={size} color="#f85149" />;
  if (type.includes("unreachable")) return <WifiOff size={size} color="#f85149" />;
  return <Activity size={size} color="#8b949e" />;
}

function MetricCard({
  label, value, sub, icon, accent,
}: { label: string; value: string | number; sub?: string; icon: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: "#161b27", border: "1px solid #21262d", borderRadius: 12,
      padding: "1.1rem 1.3rem", display: "flex", flexDirection: "column", gap: 6,
      transition: "border-color 0.2s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8,
          background: accent ? `${accent}1a` : "#21262d",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8b949e" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: "1.6rem", fontWeight: 700, color: accent ?? "#e6edf3", lineHeight: 1 }}>{value}</span>
        {sub && <span style={{ fontSize: 12, color: "#8b949e" }}>{sub}</span>}
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: SessionStatus }) {
  const [expanded, setExpanded] = useState(false);
  const color = statusColor(session.status);
  const bg = statusBg(session.status);
  const apiCount = Object.keys(session.apis).length;

  return (
    <div
      onClick={() => setExpanded((e) => !e)}
      style={{
        background: "#0d1117", border: `1px solid ${color}40`,
        borderRadius: 10, padding: "0.75rem 1rem", cursor: "pointer",
        transition: "border-color 0.2s, background 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot status={session.status} />
        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#8b949e", flex: 1 }}>
          #{session.id.slice(0, 8)}…
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
          padding: "2px 7px", borderRadius: 4,
          background: bg, color,
          textTransform: "uppercase",
        }}>
          {session.status}
        </span>
        {session.pending > 0 && (
          <span style={{ fontSize: 10, color: "#8b949e" }}>{session.pending} pending</span>
        )}
      </div>

      {expanded && apiCount > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.entries(session.apis).map(([api, data]) => (
            <div key={api} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <span style={{ color: "#8b949e", fontFamily: "monospace", minWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {api.split("/").slice(-2).join("/")}
              </span>
              <div style={{ flex: 1, height: 4, background: "#21262d", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  width: `${Math.min(100, data.remaining)}%`,
                  background: data.remaining > 30 ? "#3fb950" : data.remaining > 10 ? "#d29922" : "#f85149",
                  transition: "width 0.3s",
                }} />
              </div>
              <span style={{ color: "#e6edf3", minWidth: 28, textAlign: "right" }}>{data.remaining}</span>
              <span style={{ color: "#484f58", minWidth: 50 }}>↺ {data.resetIn}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CircuitBreakerBadge({ state }: { state: CircuitBreakerState }) {
  const color = statusColor(state.state);
  const bg = statusBg(state.state);
  const label = state.state === "closed" ? "CLOSED (healthy)"
    : state.state === "open" ? "OPEN (blocking)"
    : "HALF-OPEN (testing)";

  return (
    <div style={{
      background: bg, border: `1px solid ${color}50`,
      borderRadius: 10, padding: "1rem 1.2rem",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {state.state === "closed" ? <ShieldCheck size={16} color={color} /> : <ShieldAlert size={16} color={color} />}
        <span style={{ fontWeight: 700, color, fontSize: 13 }}>Circuit Breaker: {label}</span>
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#8b949e" }}>
        <span>{state.consecutiveFailures} consecutive failures</span>
        {state.lastError && <span style={{ color: "#6e7681" }}>Last: {state.lastError.slice(0, 60)}</span>}
      </div>
    </div>
  );
}

const TABLES = [
  "cluster_tweets",
  "profile_relationships",
  "profile_analysis",
  "hashtag_stats",
  "clusters",
  "tweets",
  "processing_jobs",
  "profiles",
];

export default function DevPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0f1117", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontFamily: "sans-serif" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", marginRight: 8 }} />
        Loading Developer Tools...
      </div>
    }>
      <DevPageContent />
    </Suspense>
  );
}

function DevPageContent() {
  const [activeTab, setActiveTab] = useState<Tab>("delete");

  const searchParams = useSearchParams();
  const router = useRouter();

  // Sync tab with URL query parameter
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "nitter" || tabParam === "delete" || tabParam === "check") {
      setActiveTab(tabParam as Tab);
    }
  }, [searchParams]);

  // Delete Data State
  const [status, setStatus] = useState<Status>("idle");

  // Nitter Health state
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLastRefreshed, setHealthLastRefreshed] = useState<Date | null>(null);
  const [healthRefreshing, setHealthRefreshing] = useState(false);

  const fetchHealthData = useCallback(async (isManual = false) => {
    if (isManual) setHealthRefreshing(true);
    try {
      const res = await fetch("/api/nitter-health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setHealthData(json);
      setHealthLastRefreshed(new Date());
      setHealthError(null);
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setHealthLoading(false);
      setHealthRefreshing(false);
    }
  }, []);

  // Poll Nitter health every 75s if Nitter tab is active
  useEffect(() => {
    if (activeTab === "nitter") {
      fetchHealthData();
      const t = setInterval(() => fetchHealthData(), 75_000);
      return () => clearInterval(t);
    }
  }, [activeTab, fetchHealthData]);
  const [clearedTables, setClearedTables] = useState<string[]>([]);
  const [skippedTables, setSkippedTables] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [profileSearchQuery, setProfileSearchQuery] = useState("");
  const [profileSearchResults, setProfileSearchResults] = useState<{ username: string, display_name: string, profile_image_url: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [deleteProfileStatus, setDeleteProfileStatus] = useState<Status>("idle");
  const [deleteProfileError, setDeleteProfileError] = useState<string | null>(null);

  // Check Data State
  const [checkSearchQuery, setCheckSearchQuery] = useState("");
  const [checkSearchResults, setCheckSearchResults] = useState<{ username: string, display_name: string, profile_image_url: string }[]>([]);
  const [isCheckSearching, setIsCheckSearching] = useState(false);
  const [selectedCheckProfile, setSelectedCheckProfile] = useState<string | null>(null);
  const [checkDataStatus, setCheckDataStatus] = useState<Status>("idle");
  const [checkDataResult, setCheckDataResult] = useState<any>(null);
  const [checkDataError, setCheckDataError] = useState<string | null>(null);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const checkSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Search logic for Delete tab
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!profileSearchQuery.trim()) {
      setProfileSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dev/search-profiles?q=${encodeURIComponent(profileSearchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setProfileSearchResults(data.profiles || []);
        }
      } catch (err) {
        console.error("Failed to search profiles", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [profileSearchQuery]);

  // Search logic for Check tab
  useEffect(() => {
    if (checkSearchTimeoutRef.current) clearTimeout(checkSearchTimeoutRef.current);
    if (!checkSearchQuery.trim()) {
      setCheckSearchResults([]);
      setIsCheckSearching(false);
      return;
    }
    setIsCheckSearching(true);
    checkSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dev/search-profiles?q=${encodeURIComponent(checkSearchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setCheckSearchResults(data.profiles || []);
        }
      } catch (err) {
        console.error("Failed to search profiles", err);
      } finally {
        setIsCheckSearching(false);
      }
    }, 300);
    return () => { if (checkSearchTimeoutRef.current) clearTimeout(checkSearchTimeoutRef.current); };
  }, [checkSearchQuery]);

  const handleDeleteProfile = async () => {
    if (!selectedProfile) return;
    setDeleteProfileStatus("loading");
    setDeleteProfileError(null);
    try {
      const res = await fetch("/api/dev/delete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: selectedProfile })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete profile");
      setDeleteProfileStatus("success");
      setProfileSearchQuery("");
      setProfileSearchResults([]);
      setSelectedProfile(null);
    } catch (err) {
      setDeleteProfileError(err instanceof Error ? err.message : "Unknown error");
      setDeleteProfileStatus("error");
    }
  };

  const handleClearDb = async () => {
    setStatus("loading");
    setErrorMsg(null);
    setClearedTables([]);
    try {
      const res = await fetch("/api/dev/clear-db", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear database");
      setClearedTables(data.cleared ?? []);
      setSkippedTables(data.skipped ?? []);
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  };

  const handleCheckDuplicates = async (username: string) => {
    setCheckDataStatus("loading");
    setCheckDataError(null);
    try {
      const res = await fetch(`/api/dev/check-duplicates?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to check duplicates");
      setCheckDataResult(data);
      setCheckDataStatus("success");
    } catch (err) {
      setCheckDataError(err instanceof Error ? err.message : "Unknown error");
      setCheckDataStatus("error");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.header}>
          <div style={styles.headerIcon}>
            <Bug size={22} color="#a78bfa" />
          </div>
          <div>
            <h1 style={styles.title}>Developer Tools</h1>
          </div>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tabBtn, ...(activeTab === "delete" ? styles.tabBtnActive : {}) }}
            onClick={() => {
              setActiveTab("delete");
              router.push("?tab=delete");
            }}
          >
            <Trash2 size={16} /> Delete Data
          </button>
          <button
            style={{ ...styles.tabBtn, ...(activeTab === "check" ? styles.tabBtnActive : {}) }}
            onClick={() => {
              setActiveTab("check");
              router.push("?tab=check");
            }}
          >
            <ListChecks size={16} /> Check Data
          </button>
          <button
            style={{ ...styles.tabBtn, ...(activeTab === "nitter" ? styles.tabBtnActive : {}) }}
            onClick={() => {
              setActiveTab("nitter");
              router.push("?tab=nitter");
            }}
          >
            <Activity size={16} /> Nitter Health
          </button>
        </div>

        {activeTab === "delete" && (
          <div style={styles.tabContent}>
            {/* Delete Profile Card */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <UserX size={18} color="#f87171" />
                <span style={styles.cardTitle}>Delete Specific Profile</span>
                <span style={styles.dangerBadge}>DESTRUCTIVE</span>
              </div>
              <p style={styles.cardDesc}>
                Removes a specific profile and all associated data (tweets, relationships, analysis).
              </p>
              <div style={{ position: "relative" }}>
                <div style={styles.searchContainer}>
                  <Search size={16} color="#9ca3af" />
                  <input
                    type="text"
                    value={profileSearchQuery}
                    onChange={(e) => {
                      setProfileSearchQuery(e.target.value);
                      setSelectedProfile(null);
                      setDeleteProfileStatus("idle");
                    }}
                    placeholder="Search profile by username or name..."
                    style={styles.searchInput}
                  />
                  {isSearching && <Loader2 size={16} color="#9ca3af" style={{ animation: "spin 1s linear infinite" }} />}
                </div>

                {profileSearchResults.length > 0 && !selectedProfile && (
                  <div style={styles.dropdown}>
                    {profileSearchResults.map((p) => (
                      <div
                        key={p.username}
                        style={styles.dropdownItem}
                        onClick={() => {
                          setSelectedProfile(p.username);
                          setProfileSearchQuery(p.username);
                          setProfileSearchResults([]);
                        }}
                      >
                        {p.profile_image_url && <img src={p.profile_image_url} alt="" style={styles.dropdownAvatar} />}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 600, color: "#f3f4f6" }}>{p.display_name || p.username}</span>
                          <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>@{p.username}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedProfile && (
                <div style={{ marginTop: "1rem" }}>
                  {(deleteProfileStatus === "idle" || deleteProfileStatus === "confirming") && (
                    <div style={styles.actionRow}>
                      {deleteProfileStatus === "idle" ? (
                        <button style={styles.dangerBtn} onClick={() => setDeleteProfileStatus("confirming")}>
                          <Trash2 size={16} /> Delete @{selectedProfile}
                        </button>
                      ) : (
                        <>
                          <div style={styles.confirmBox}>
                            <AlertTriangle size={18} color="#fbbf24" />
                            <span>Are you sure? This will delete @{selectedProfile} and all their tweets.</span>
                          </div>
                          <div style={styles.confirmButtons}>
                            <button style={styles.dangerBtn} onClick={handleDeleteProfile}>
                              Yes, delete profile
                            </button>
                            <button style={styles.cancelBtn} onClick={() => setDeleteProfileStatus("idle")}>
                              Cancel
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {deleteProfileStatus === "loading" && (
                    <div style={styles.feedbackRow}>
                      <Loader2 size={20} color="#a78bfa" style={{ animation: "spin 1s linear infinite" }} />
                      <span style={{ color: "#a78bfa" }}>Deleting profile…</span>
                    </div>
                  )}

                  {deleteProfileStatus === "success" && (
                    <div style={{ ...styles.feedbackRow, flexDirection: "column", alignItems: "flex-start", gap: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <CheckCircle2 size={20} color="#34d399" />
                        <span style={{ color: "#34d399", fontWeight: 600 }}>Profile deleted successfully</span>
                      </div>
                      <button style={styles.cancelBtn} onClick={() => {
                        setDeleteProfileStatus("idle");
                        setSelectedProfile(null);
                        setProfileSearchQuery("");
                      }}>
                        Done
                      </button>
                    </div>
                  )}

                  {deleteProfileStatus === "error" && (
                    <div style={{ ...styles.feedbackRow, flexDirection: "column", alignItems: "flex-start", gap: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <AlertTriangle size={20} color="#f87171" />
                        <span style={{ color: "#f87171", fontWeight: 600 }}>Failed to delete profile</span>
                      </div>
                      <p style={{ color: "#6b7280", fontSize: "0.85rem", margin: 0 }}>{deleteProfileError}</p>
                      <button style={styles.cancelBtn} onClick={() => setDeleteProfileStatus("idle")}>
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Clear DB Card */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <Database size={18} color="#f87171" />
                <span style={styles.cardTitle}>Clear Entire Database</span>
                <span style={styles.dangerBadge}>DESTRUCTIVE</span>
              </div>
              <p style={styles.cardDesc}>
                Truncates all tables and resets sequences. <strong>Irreversible</strong>.
              </p>
              <div style={styles.tableList}>
                {TABLES.map((t) => {
                  const isCleared = clearedTables.includes(t);
                  const isSkipped = skippedTables.includes(t);
                  return (
                    <span key={t} style={{
                      ...styles.tableChip,
                      ...(isCleared ? styles.tableChipCleared : {}),
                      ...(isSkipped ? styles.tableChipSkipped : {}),
                    }}>
                      {t} {isSkipped && "(skipped)"}
                    </span>
                  );
                })}
              </div>

              {(status === "idle" || status === "confirming") && (
                <div style={styles.actionRow}>
                  {status === "idle" ? (
                    <button style={styles.dangerBtn} onClick={() => setStatus("confirming")}>
                      <Trash2 size={16} /> Clear All Tables
                    </button>
                  ) : (
                    <>
                      <div style={styles.confirmBox}>
                        <AlertTriangle size={18} color="#fbbf24" />
                        <span>Are you sure? This will permanently delete all data.</span>
                      </div>
                      <div style={styles.confirmButtons}>
                        <button style={styles.dangerBtn} onClick={handleClearDb}>
                          Yes, clear everything
                        </button>
                        <button style={styles.cancelBtn} onClick={() => setStatus("idle")}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {status === "loading" && (
                <div style={styles.feedbackRow}>
                  <Loader2 size={20} color="#a78bfa" style={{ animation: "spin 1s linear infinite" }} />
                  <span style={{ color: "#a78bfa" }}>Clearing all tables…</span>
                </div>
              )}

              {status === "success" && (
                <div style={{ ...styles.feedbackRow, flexDirection: "column", alignItems: "flex-start", gap: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <CheckCircle2 size={20} color="#34d399" />
                    <span style={{ color: "#34d399", fontWeight: 600 }}>Database cleared successfully</span>
                  </div>
                  <p style={{ color: "#6b7280", fontSize: "0.85rem", margin: 0 }}>
                    {clearedTables.length} tables truncated. {skippedTables.length > 0 && `${skippedTables.length} missing.`}
                  </p>
                  <button style={styles.cancelBtn} onClick={() => setStatus("idle")}>Done</button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "check" && (
          <div style={styles.tabContent}>
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <ListChecks size={18} color="#60a5fa" />
                <span style={styles.cardTitle}>Find Duplicated Tweets</span>
              </div>
              <p style={styles.cardDesc}>
                Search for a profile to see if any tweets (with the exact same raw text) were saved multiple times under different tweet IDs.
              </p>

              <div style={{ position: "relative" }}>
                <div style={styles.searchContainer}>
                  <Search size={16} color="#9ca3af" />
                  <input
                    type="text"
                    value={checkSearchQuery}
                    onChange={(e) => {
                      setCheckSearchQuery(e.target.value);
                      setSelectedCheckProfile(null);
                      setCheckDataResult(null);
                    }}
                    placeholder="Search profile by username..."
                    style={styles.searchInput}
                  />
                  {isCheckSearching && <Loader2 size={16} color="#9ca3af" style={{ animation: "spin 1s linear infinite" }} />}
                </div>

                {checkSearchResults.length > 0 && !selectedCheckProfile && (
                  <div style={styles.dropdown}>
                    {checkSearchResults.map((p) => (
                      <div
                        key={p.username}
                        style={styles.dropdownItem}
                        onClick={() => {
                          setSelectedCheckProfile(p.username);
                          setCheckSearchQuery(p.username);
                          setCheckSearchResults([]);
                          handleCheckDuplicates(p.username);
                        }}
                      >
                        {p.profile_image_url && <img src={p.profile_image_url} alt="" style={styles.dropdownAvatar} />}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 600, color: "#f3f4f6" }}>{p.display_name || p.username}</span>
                          <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>@{p.username}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {checkDataStatus === "loading" && (
                <div style={styles.feedbackRow}>
                  <Loader2 size={20} color="#a78bfa" style={{ animation: "spin 1s linear infinite" }} />
                  <span style={{ color: "#a78bfa" }}>Checking database for duplicates…</span>
                </div>
              )}

              {checkDataStatus === "success" && checkDataResult && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
                  <div style={{ ...styles.feedbackRow, background: checkDataResult.totalExtraCopies > 0 ? "rgba(248,113,113,0.1)" : "rgba(52,211,153,0.1)", border: "none" }}>
                    {checkDataResult.totalExtraCopies > 0 ? (
                      <AlertTriangle size={20} color="#f87171" />
                    ) : (
                      <CheckCircle2 size={20} color="#34d399" />
                    )}
                    <div>
                      <span style={{ fontWeight: 600, color: checkDataResult.totalExtraCopies > 0 ? "#f87171" : "#34d399", display: "block" }}>
                        {checkDataResult.totalExtraCopies > 0
                          ? `Found ${checkDataResult.totalExtraCopies} extra duplicated tweets across ${checkDataResult.totalDuplicateGroups} groups.`
                          : "No duplicate tweets found! The data is clean."}
                      </span>
                    </div>
                  </div>

                  {checkDataResult.duplicates?.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "400px", overflowY: "auto", paddingRight: "0.5rem" }}>
                      {checkDataResult.duplicates.map((dup: any, i: number) => (
                        <div key={i} style={styles.duplicateItem}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                            <span style={styles.dupBadge}>{dup.count} copies</span>
                            <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>{new Date(dup.first_seen).toLocaleDateString()} to {new Date(dup.last_seen).toLocaleDateString()}</span>
                          </div>
                          <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "#d1d5db", whiteSpace: "pre-wrap", background: "#1f2937", padding: "0.5rem", borderRadius: "6px" }}>
                            {dup.raw_text}
                          </p>
                          <div style={{ fontSize: "0.75rem", color: "#9ca3af", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                            <strong>Tweet IDs:</strong>
                            {dup.tweet_ids.map((id: string) => (
                              <span key={id} style={{ background: "#000", padding: "0.1rem 0.3rem", borderRadius: "4px" }}>{id}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "nitter" && (
          <div style={styles.tabContent}>
            {/* Critical alert banner */}
            {healthData?.snapshot && healthData.snapshot.sessions.healthy === 0 && healthData.snapshot.sessions.total > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.9rem 1.2rem", borderRadius: 10, background: "rgba(248,81,73,0.1)", border: "1px solid rgba(248,81,73,0.4)", color: "#f85149" }}>
                <AlertTriangle size={18} />
                <span style={{ fontWeight: 600 }}>⚠️ ALL sessions rate-limited — Nitter is effectively down until limits reset.</span>
              </div>
            )}

            {/* Refresh button & last refreshed info */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#161b27", border: "1px solid #1f2937", borderRadius: "12px", padding: "1rem 1.5rem" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#f3f4f6" }}>Telemetry Status</span>
                {healthLastRefreshed && (
                  <span style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                    Refreshed {timeAgo(healthLastRefreshed.toISOString())}
                  </span>
                )}
              </div>
              <button
                id="nitter-health-refresh-btn"
                onClick={() => fetchHealthData(true)}
                disabled={healthRefreshing}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "0.5rem 1rem", borderRadius: 8,
                  border: "1px solid #374151", background: "#1f2937",
                  color: "#9ca3af", fontSize: 13, fontWeight: 500,
                  cursor: "pointer", transition: "all 0.2s",
                }}
              >
                <RefreshCw size={14} style={{ animation: healthRefreshing ? "spin 0.8s linear infinite" : "none" }} />
                Refresh
              </button>
            </div>

            {/* Loading / Error state */}
            {healthLoading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "3rem", color: "#9ca3af" }}>
                <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
                <span>Polling Nitter health endpoints…</span>
              </div>
            )}

            {healthError && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "1rem 1.2rem", borderRadius: 10, background: "rgba(248,81,73,0.1)", border: "1px solid rgba(248,81,73,0.3)", color: "#f87171" }}>
                <XCircle size={18} />
                <span>Failed to load health data: {healthError}</span>
              </div>
            )}

            {!healthLoading && healthData && (
              <>
                {/* Metric grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem" }}>
                  <MetricCard
                    label="Session Health"
                    value={`${healthData.snapshot?.sessions.healthy ?? 0}/${healthData.snapshot?.sessions.total ?? 0}`}
                    sub={`${healthData.snapshot?.sessions.total ? Math.round(((healthData.snapshot?.sessions.healthy ?? 0) / (healthData.snapshot?.sessions.total ?? 1)) * 100) : 0}% healthy`}
                    icon={<Activity size={15} color={statusColor(healthData.snapshot?.sessions.healthy ? "healthy" : "down")} />}
                    accent={statusColor(healthData.snapshot?.sessions.healthy ? "healthy" : "down")}
                  />
                  <MetricCard
                    label="Limited"
                    value={healthData.snapshot?.sessions.limited ?? "—"}
                    sub="throttled"
                    icon={<AlertTriangle size={15} color="#d29922" />}
                    accent="#d29922"
                  />
                  <MetricCard
                    label="Req/min"
                    value={healthData.requestStats?.rpm ?? "—"}
                    sub={`${healthData.requestStats?.rateLimits ?? 0} rate-limits`}
                    icon={<Zap size={15} color="#60a5fa" />}
                    accent="#60a5fa"
                  />
                  <MetricCard
                    label="Proxy"
                    value={healthData.snapshot?.proxy.status ?? "—"}
                    sub={healthData.snapshot?.proxy.latencyMs != null ? `${healthData.snapshot.proxy.latencyMs}ms` : "—"}
                    icon={healthData.snapshot?.proxy.status === "healthy" ? <Wifi size={15} color="#3fb950" /> : <WifiOff size={15} color="#f85149" />}
                    accent={statusColor(healthData.snapshot?.proxy.status ?? "unknown")}
                  />
                </div>

                {/* Circuit Breaker detail */}
                <CircuitBreakerBadge state={healthData.circuitBreaker} />

                {/* Session Pool card */}
                <div style={{ background: "#161b27", border: "1px solid #1f2937", borderRadius: 12, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Server size={15} color="#60a5fa" />
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af" }}>Session Pool</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>click to inspect</span>
                  </div>

                  {healthData.snapshot && healthData.snapshot.sessions.total > 0 && (
                    <div style={{ display: "flex", gap: 3 }}>
                      {Array.from({ length: healthData.snapshot.sessions.total }).map((_, i) => {
                        const session = healthData.snapshot?.sessions.details[i];
                        const s = session?.status ?? "healthy";
                        return (
                          <div key={i} style={{
                            flex: 1, height: 6, borderRadius: 2,
                            background: statusColor(s),
                            transition: "background 0.3s",
                          }} title={s} />
                        );
                      })}
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                    {healthData.snapshot?.sessions.details && healthData.snapshot.sessions.details.length > 0
                      ? healthData.snapshot.sessions.details.map((s) => <SessionCard key={s.id} session={s} />)
                      : (
                        <div style={{ fontSize: 12, color: "#6b7280", padding: "0.5rem" }}>
                          Session details not available — ensure <code style={{ color: "#9ca3af" }}>enableDebug = true</code> in nitter.conf
                        </div>
                      )
                    }
                  </div>
                </div>

                {/* Proxy health detailed card */}
                {healthData.snapshot?.proxy && (
                  <div style={{ background: "#161b27", border: "1px solid #1f2937", borderRadius: 12, padding: "1.25rem", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Globe size={15} color="#60a5fa" />
                      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af" }}>Proxy Connectivity</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <StatusDot status={healthData.snapshot.proxy.status} />
                      <span style={{ fontWeight: 600, color: statusColor(healthData.snapshot.proxy.status), textTransform: "capitalize" }}>{healthData.snapshot.proxy.status}</span>
                      {healthData.snapshot.proxy.latencyMs != null && (
                        <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>{healthData.snapshot.proxy.latencyMs}ms latency</span>
                      )}
                    </div>
                    {healthData.snapshot.proxy.error && (
                      <div style={{ fontSize: 11, color: "#f87171", padding: "0.4rem 0.6rem", background: "rgba(239,68,68,0.1)", borderRadius: 6 }}>
                        {healthData.snapshot.proxy.error}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6b7280" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={11} /> Checked {timeAgo(healthData.snapshot.proxy.lastChecked)}
                      </span>
                      {healthData.snapshot.proxy.consecutiveFailures > 0 && (
                        <span style={{ color: "#fbbf24" }}>{healthData.snapshot.proxy.consecutiveFailures} failures</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Event Log card */}
                <div style={{ background: "#161b27", border: "1px solid #1f2937", borderRadius: 12, padding: "1.25rem", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Clock size={15} color="#60a5fa" />
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af" }}>Event Log</span>
                    {healthData.events.length > 0 && (
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "#6b7280" }}>{healthData.events.length} events</span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 180, overflowY: "auto" }}>
                    {healthData.events.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        No recent event logs
                      </div>
                    ) : healthData.events.map((evt) => (
                      <div key={evt.id} style={{ display: "flex", gap: 8, padding: "0.45rem 0.6rem", borderRadius: 6, background: "#0f1117", alignItems: "flex-start" }}>
                        <span style={{ flexShrink: 0, marginTop: 1 }}><EventIcon type={evt.type} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: "#e5e7eb", lineHeight: 1.4, wordBreak: "break-word" }}>{evt.message}</div>
                          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{timeAgo(evt.timestamp)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer status link references */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280", padding: "0.25rem 0.5rem" }}>
                  <span>Nitter Host: <a href="http://localhost:8081" target="_blank" rel="noopener" style={{ color: "#60a5fa" }}>localhost:8081</a></span>
                  <span>Health API: <a href="http://localhost:8081/.health" target="_blank" rel="noopener" style={{ color: "#60a5fa" }}>/.health</a></span>
                  <span>Sessions API: <a href="http://localhost:8081/.sessions" target="_blank" rel="noopener" style={{ color: "#60a5fa" }}>/.sessions</a></span>
                </div>
              </>
            )}
          </div>
        )}

      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes pulse-dot { 0% { box-shadow: 0 0 0 0 rgba(63,185,80,0.5); } 70% { box-shadow: 0 0 0 6px rgba(63,185,80,0); } 100% { box-shadow: 0 0 0 0 rgba(63,185,80,0); } }`}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0f1117", padding: "2rem 1rem", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", color: "#e5e7eb" },
  shell: { maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "2rem" },
  header: { display: "flex", alignItems: "center", gap: "1rem", paddingBottom: "1.5rem", borderBottom: "1px solid #1f2937" },
  headerIcon: { width: "44px", height: "44px", borderRadius: "10px", background: "#1e1b4b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  title: { margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "#f9fafb" },
  subtitle: { margin: "0.15rem 0 0", fontSize: "0.85rem", color: "#6b7280" },
  tabs: { display: "flex", gap: "1rem", borderBottom: "1px solid #1f2937" },
  tabBtn: { display: "flex", alignItems: "center", gap: "0.5rem", background: "none", border: "none", padding: "0.75rem 1rem", color: "#9ca3af", fontSize: "0.95rem", fontWeight: 500, cursor: "pointer", borderBottomWidth: "2px", borderBottomStyle: "solid", borderBottomColor: "transparent" },
  tabBtnActive: { color: "#a78bfa", borderBottomColor: "#a78bfa" },
  tabContent: { display: "flex", flexDirection: "column", gap: "1.5rem" },
  card: { background: "#161b27", border: "1px solid #1f2937", borderRadius: "12px", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" },
  cardHeader: { display: "flex", alignItems: "center", gap: "0.6rem" },
  cardTitle: { fontWeight: 600, fontSize: "1rem", color: "#f3f4f6", flex: 1 },
  dangerBadge: { fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.06em", padding: "0.2rem 0.5rem", borderRadius: "4px", background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" },
  cardDesc: { margin: 0, color: "#9ca3af", fontSize: "0.9rem", lineHeight: 1.6 },
  tableList: { display: "flex", flexWrap: "wrap", gap: "0.4rem" },
  tableChip: { padding: "0.25rem 0.6rem", borderRadius: "6px", fontSize: "0.78rem", fontFamily: "monospace", background: "#1f2937", color: "#9ca3af", border: "1px solid #374151" },
  tableChipCleared: { background: "rgba(52,211,153,0.1)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" },
  tableChipSkipped: { background: "rgba(107,114,128,0.1)", color: "#6b7280", border: "1px solid rgba(107,114,128,0.2)", fontStyle: "italic" },
  actionRow: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  confirmBox: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", borderRadius: "8px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24", fontSize: "0.88rem" },
  confirmButtons: { display: "flex", gap: "0.75rem" },
  feedbackRow: { display: "flex", alignItems: "center", gap: "0.75rem", padding: "1rem", borderRadius: "8px", background: "#0f1117", border: "1px solid #1f2937" },
  dangerBtn: { display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 1.2rem", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.12)", color: "#f87171", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", transition: "all 0.2s ease" },
  cancelBtn: { display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 1.2rem", borderRadius: "8px", border: "1px solid #374151", background: "#1f2937", color: "#9ca3af", fontWeight: 500, fontSize: "0.9rem", cursor: "pointer", transition: "all 0.2s ease" },
  searchContainer: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", borderRadius: "8px", background: "#0f1117", border: "1px solid #1f2937" },
  searchInput: { flex: 1, background: "transparent", border: "none", color: "#e5e7eb", fontSize: "0.9rem", outline: "none" },
  dropdown: { position: "absolute", top: "100%", left: 0, right: 0, marginTop: "0.25rem", background: "#1f2937", border: "1px solid #374151", borderRadius: "8px", overflow: "hidden", zIndex: 10, maxHeight: "200px", overflowY: "auto" },
  dropdownItem: { display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", cursor: "pointer", borderBottom: "1px solid #374151" },
  dropdownAvatar: { width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" },
  duplicateItem: { border: "1px solid #374151", background: "#0f1117", padding: "1rem", borderRadius: "8px" },
  dupBadge: { background: "rgba(248,113,113,0.15)", color: "#f87171", padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 600 },
};
