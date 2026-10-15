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
  Zap,
  Edit3,
  Key
} from "lucide-react";

type Status = "idle" | "confirming" | "loading" | "success" | "error";
type Tab = "delete" | "check" | "nitter" | "sessions";

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
    case "healthy": case "closed": return "var(--up)";
    case "degraded": case "half-open": return "#d29922";
    case "down": case "open": return "var(--down)";
    case "limited": return "#d29922";
    case "exhausted": return "var(--down)";
    default: return "var(--text-muted)";
  }
}

function statusBg(status: string): string {
  switch (status) {
    case "healthy": case "closed": return "rgba(63,185,80,0.08)";
    case "degraded": case "half-open": return "rgba(210,153,34,0.08)";
    case "down": case "open": return "rgba(248,81,73,0.08)";
    case "limited": return "rgba(210,153,34,0.08)";
    case "exhausted": return "rgba(248,81,73,0.08)";
    default: return "var(--bg-subtle)";
  }
}

function StatusDot({ status }: { status: string }) {
  const color = statusColor(status);
  const isPulse = status === "healthy" || status === "closed";
  return (
    <span className="relative inline-flex items-center justify-center w-2.5 h-2.5">
      <span
        className={`block w-2.5 h-2.5 rounded-full ${isPulse ? "animate-[pulse-dot_2s_infinite]" : ""}`}
        style={{
          background: color,
          boxShadow: isPulse ? `0 0 0 0 ${color}` : "none",
        }}
      />
    </span>
  );
}

function EventIcon({ type }: { type: string }) {
  const size = 14;
  if (type.includes("limited") || type.includes("limit")) return <AlertTriangle size={size} color="#d29922" />;
  if (type.includes("recovered")) return <CheckCircle2 size={size} color="var(--up)" />;
  if (type.includes("down") || type.includes("open")) return <XCircle size={size} color="var(--down)" />;
  if (type.includes("unreachable")) return <WifiOff size={size} color="var(--down)" />;
  return <Activity size={size} color="var(--text-muted)" />;
}

function MetricCard({
  label, value, sub, icon, accent,
}: { label: string; value: string | number; sub?: string; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl py-4 px-5 flex flex-col gap-1.5 transition-colors duration-200 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className="w-[30px] h-[30px] rounded-lg flex items-center justify-center shrink-0 text-sm"
          style={{ background: accent ? `${accent}15` : "var(--bg-subtle)" }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-semibold tracking-wider uppercase text-[var(--text-secondary)]">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="text-[1.6rem] font-bold leading-none" style={{ color: accent ?? "var(--text-primary)" }}>{value}</span>
        {sub && <span className="text-xs text-[var(--text-secondary)]">{sub}</span>}
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
      className="bg-[var(--bg-surface)] rounded-lg py-3 px-4 cursor-pointer transition-colors duration-200 border border-[var(--border)] hover:border-[var(--text-secondary)] shadow-sm"
    >
      <div className="flex items-center gap-2">
        <StatusDot status={session.status} />
        <span className="font-mono text-xs text-[var(--text-secondary)] flex-1">
          #{session.id.slice(0, 8)}…
        </span>
        <span
          className="text-[10px] font-bold tracking-[0.05em] py-[2px] px-[7px] rounded text-center uppercase"
          style={{ background: bg, color }}
        >
          {session.status}
        </span>
        {session.pending > 0 && (
          <span className="text-[10px] text-[var(--text-secondary)]">{session.pending} pending</span>
        )}
      </div>

      {expanded && apiCount > 0 && (
        <div className="mt-2.5 flex flex-col gap-1 border-t border-[var(--border)] pt-2.5">
          {Object.entries(session.apis).map(([api, data]) => (
            <div key={api} className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--text-secondary)] font-mono min-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap">
                {api.split("/").slice(-2).join("/")}
              </span>
              <div className="flex-1 h-1 bg-[var(--bg-subtle)] rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm transition-[width] duration-300"
                  style={{
                    width: `${Math.min(100, data.remaining)}%`,
                    background: data.remaining > 30 ? "var(--up)" : data.remaining > 10 ? "#d29922" : "var(--down)",
                  }}
                />
              </div>
              <span className="text-[var(--text-primary)] min-w-[28px] text-right">{data.remaining}</span>
              <span className="text-[var(--text-muted)] min-w-[50px]">↺ {data.resetIn}</span>
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
    <div
      className="rounded-lg py-4 px-5 flex flex-col gap-1.5 border shadow-sm"
      style={{ background: bg, borderColor: color }}
    >
      <div className="flex items-center gap-2">
        {state.state === "closed" ? <ShieldCheck size={16} color={color} /> : <ShieldAlert size={16} color={color} />}
        <span className="font-bold text-[13px]" style={{ color }}>Circuit Breaker: {label}</span>
      </div>
      <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
        <span>{state.consecutiveFailures} consecutive failures</span>
        {state.lastError && <span className="text-[var(--text-muted)]">Last: {state.lastError.slice(0, 60)}</span>}
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
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center text-gray-400 font-sans">
        <Loader2 size={24} className="animate-spin mr-2" />
        Loading Developer Tools...
      </div>
    }>
      <DevPageContent />
    </Suspense>
  );
}

function DevPageContent() {
  const [activeTab, setActiveTab] = useState<Tab>("check");

  const searchParams = useSearchParams();
  const router = useRouter();

  // Sync tab with URL query parameter
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "nitter" || tabParam === "delete" || tabParam === "check" || tabParam === "sessions") {
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

  // Sessions Tab State
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsFilePath, setSessionsFilePath] = useState<string>("");
  const [nextSessionId, setNextSessionId] = useState<string>("1");
  const [newUsername, setNewUsername] = useState<string>("");
  const [newAuthToken, setNewAuthToken] = useState<string>("");
  const [newCt0, setNewCt0] = useState<string>("");
  const [sessionSubmitting, setSessionSubmitting] = useState<boolean>(false);
  const [sessionSuccessMsg, setSessionSuccessMsg] = useState<string | null>(null);

  const fetchSessionsData = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const res = await fetch("/api/dev/sessions");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to fetch sessions");
      setSessionsList(data.sessions || []);
      setSessionsFilePath(data.filePath || "");
      setNextSessionId(data.nextId || "1");
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "sessions") {
      fetchSessionsData();
    }
  }, [activeTab, fetchSessionsData]);

  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newAuthToken.trim() || !newCt0.trim()) {
      setSessionsError("Please fill in all fields (username, auth_token, ct0)");
      return;
    }
    const cleanUser = newUsername.trim().replace(/^@/, "").toLowerCase();
    const cleanAuth = newAuthToken.trim();
    const cleanCt0 = newCt0.trim();

    const dupUser = sessionsList.find((s) => s.username?.toLowerCase() === cleanUser);
    if (dupUser) {
      setSessionsError(`An entry with username @${dupUser.username} is already present in the sessions file.`);
      return;
    }
    const dupAuth = sessionsList.find((s) => s.auth_token === cleanAuth);
    if (dupAuth) {
      setSessionsError(`An entry (@${dupAuth.username || "unknown"}) with this auth_token is already present in the sessions file.`);
      return;
    }
    const dupCt0 = sessionsList.find((s) => s.ct0 === cleanCt0);
    if (dupCt0) {
      setSessionsError(`An entry (@${dupCt0.username || "unknown"}) with this ct0 is already present in the sessions file.`);
      return;
    }

    setSessionSubmitting(true);
    setSessionsError(null);
    setSessionSuccessMsg(null);
    try {
      const res = await fetch("/api/dev/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          auth_token: newAuthToken.trim(),
          ct0: newCt0.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to add session");
      setSessionSuccessMsg(`Successfully appended session #${data.session.id} (@${data.session.username})!`);
      setNewUsername("");
      setNewAuthToken("");
      setNewCt0("");
      await fetchSessionsData();
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : "Failed to add session");
    } finally {
      setSessionSubmitting(false);
    }
  };

  // Edit Session State
  const [editingSessionId, setEditingSessionId] = useState<string>("");
  const [editingAuthToken, setEditingAuthToken] = useState<string>("");
  const [editingCt0, setEditingCt0] = useState<string>("");
  const [editingSubmitting, setEditingSubmitting] = useState<boolean>(false);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [editingSuccessMsg, setEditingSuccessMsg] = useState<string | null>(null);

  // Reindex IDs State
  const [reindexing, setReindexing] = useState<boolean>(false);

  const handleSelectSessionForEdit = (id: string) => {
    setEditingSessionId(id);
    setEditingError(null);
    setEditingSuccessMsg(null);
    const found = sessionsList.find((s) => String(s.id) === String(id));
    if (found) {
      setEditingAuthToken(found.auth_token || "");
      setEditingCt0(found.ct0 || "");
    } else {
      setEditingAuthToken("");
      setEditingCt0("");
    }
  };

  const handleUpdateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSessionId || !editingAuthToken.trim() || !editingCt0.trim()) {
      setEditingError("Please select a session and provide valid auth_token and ct0 values.");
      return;
    }
    setEditingSubmitting(true);
    setEditingError(null);
    setEditingSuccessMsg(null);
    try {
      const res = await fetch("/api/dev/sessions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingSessionId,
          auth_token: editingAuthToken.trim(),
          ct0: editingCt0.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to update session");
      setEditingSuccessMsg(`Successfully updated auth_token and ct0 for @${data.session.username} (#${data.session.id})!`);
      await fetchSessionsData();
    } catch (err) {
      setEditingError(err instanceof Error ? err.message : "Failed to update session");
    } finally {
      setEditingSubmitting(false);
    }
  };

  const handleReindexIds = async () => {
    setReindexing(true);
    setSessionsError(null);
    setSessionSuccessMsg(null);
    setEditingSuccessMsg(null);
    try {
      const res = await fetch("/api/dev/sessions", {
        method: "PATCH",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to refresh IDs");
      setSessionSuccessMsg(`Successfully re-indexed ${data.total} session IDs sequentially starting from #1!`);
      setSessionsList(data.sessions || []);
      setNextSessionId(data.nextId || "1");
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : "Failed to refresh IDs");
    } finally {
      setReindexing(false);
    }
  };

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
    <div className="w-full flex justify-center pt-24 pb-20 px-6 sm:pt-12 sm:pb-10 sm:px-4">
      <div className="w-full max-w-[960px] mx-auto flex flex-col gap-8">
        <div className="flex justify-between items-center gap-4 border-b border-[var(--border)] pb-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight m-0 text-[var(--text-primary)]">
              Developer Tools
            </h1>

          </div>
        </div>

        {/* Tab bar (Topics-style pill bar) */}
        <div className="flex gap-1.5 bg-[var(--bg-subtle)] p-1 rounded-lg border border-[var(--border)] w-full">
          {(["check", "delete", "nitter", "sessions"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                router.push(`?tab=${tab}`);
              }}
              className={`flex-1 rounded-md py-1.5 px-4 text-[13px] font-semibold cursor-pointer text-center transition-all duration-150 ${activeTab === tab
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                : "bg-transparent text-[var(--text-secondary)] border border-transparent shadow-none hover:text-[var(--text-primary)]"
                }`}
            >
              {tab === "check" && "Check Data"}
              {tab === "delete" && "Delete Data"}
              {tab === "nitter" && "Nitter Health"}
              {tab === "sessions" && "Add Sessions"}
            </button>
          ))}
        </div>

        {activeTab === "delete" && (
          <div className="flex flex-col gap-6">
            {/* Delete Profile Card */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col gap-5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <UserX size={18} className="text-[var(--down)]" />
                <span className="font-semibold text-base text-[var(--text-primary)] flex-1">Delete Specific Profile</span>
                <span className="text-[10px] font-bold tracking-[0.06em] py-0.5 px-2 rounded bg-[var(--down)]/10 text-[var(--down)] border border-[var(--down)]/20 uppercase">DESTRUCTIVE</span>
              </div>
              <p className="m-0 text-[var(--text-secondary)] text-[14px] leading-relaxed">
                Removes a specific profile and all associated data (tweets, relationships, analysis).
              </p>
              <div className="relative">
                <div className="flex items-center gap-2.5 py-2.5 px-3.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
                  <Search size={15} className="text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={profileSearchQuery}
                    onChange={(e) => {
                      setProfileSearchQuery(e.target.value);
                      setSelectedProfile(null);
                      setDeleteProfileStatus("idle");
                    }}
                    placeholder="Search profile by username or name..."
                    className="flex-1 bg-transparent border-none text-[var(--text-primary)] text-sm outline-none placeholder-[var(--text-muted)]"
                  />
                  {isSearching && <Loader2 size={15} className="text-[var(--text-secondary)] animate-spin" />}
                </div>

                {profileSearchResults.length > 0 && !selectedProfile && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden z-10 max-h-[200px] overflow-y-auto shadow-xl">
                    {profileSearchResults.map((p) => (
                      <div
                        key={p.username}
                        className="flex items-center gap-3 py-2.5 px-3.5 cursor-pointer border-b border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
                        onClick={() => {
                          setSelectedProfile(p.username);
                          setProfileSearchQuery(p.username);
                          setProfileSearchResults([]);
                        }}
                      >
                        {p.profile_image_url && <img src={p.profile_image_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />}
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-[var(--text-primary)] truncate">{p.display_name || p.username}</span>
                          <span className="text-xs text-[var(--text-secondary)]">@{p.username}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedProfile && (
                <div className="mt-2">
                  {(deleteProfileStatus === "idle" || deleteProfileStatus === "confirming") && (
                    <div className="flex flex-col gap-3">
                      {deleteProfileStatus === "idle" ? (
                        <button
                          className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[var(--down)] hover:bg-[var(--down)]/90 text-white font-semibold text-sm cursor-pointer transition-colors shadow-sm w-fit"
                          onClick={() => setDeleteProfileStatus("confirming")}
                        >
                          <Trash2 size={15} /> Delete @{selectedProfile}
                        </button>
                      ) : (
                        <>
                          <div className="flex items-center gap-2.5 py-3 px-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm">
                            <AlertTriangle size={17} className="text-amber-500 shrink-0" />
                            <span>Are you sure? This will delete @{selectedProfile} and all their tweets.</span>
                          </div>
                          <div className="flex gap-3">
                            <button
                              className="inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-lg bg-[var(--down)] hover:bg-[var(--down)]/90 text-white font-semibold text-sm cursor-pointer transition-colors shadow-sm"
                              onClick={handleDeleteProfile}
                            >
                              Yes, delete profile
                            </button>
                            <button
                              className="inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] font-medium text-sm cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                              onClick={() => setDeleteProfileStatus("idle")}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {deleteProfileStatus === "loading" && (
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
                      <Loader2 size={18} className="text-[var(--accent)] animate-spin" />
                      <span className="text-[var(--text-secondary)]">Deleting profile…</span>
                    </div>
                  )}

                  {deleteProfileStatus === "success" && (
                    <div className="flex flex-col items-start gap-3 p-4 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-[var(--up)]" />
                        <span className="text-[var(--up)] font-semibold">Profile deleted successfully</span>
                      </div>
                      <button
                        className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium text-sm cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                        onClick={() => {
                          setDeleteProfileStatus("idle");
                          setSelectedProfile(null);
                          setProfileSearchQuery("");
                        }}
                      >
                        Done
                      </button>
                    </div>
                  )}

                  {deleteProfileStatus === "error" && (
                    <div className="flex flex-col items-start gap-3 p-4 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={18} className="text-[var(--down)]" />
                        <span className="text-[var(--down)] font-semibold">Failed to delete profile</span>
                      </div>
                      <p className="text-[var(--text-secondary)] text-[13px] m-0">{deleteProfileError}</p>
                      <button
                        className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium text-sm cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                        onClick={() => setDeleteProfileStatus("idle")}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Clear DB Card */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col gap-5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <Database size={18} className="text-[var(--down)]" />
                <span className="font-semibold text-base text-[var(--text-primary)] flex-1">Clear Entire Database</span>
                <span className="text-[10px] font-bold tracking-[0.06em] py-0.5 px-2 rounded bg-[var(--down)]/10 text-[var(--down)] border border-[var(--down)]/20 uppercase">DESTRUCTIVE</span>
              </div>
              <p className="m-0 text-[var(--text-secondary)] text-[14px] leading-relaxed">
                Truncates all tables and resets sequences. <strong className="text-[var(--text-primary)] font-semibold">Irreversible</strong>.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TABLES.map((t) => {
                  const isCleared = clearedTables.includes(t);
                  const isSkipped = skippedTables.includes(t);
                  return (
                    <span
                      key={t}
                      className={`py-1 px-2.5 rounded-md text-[11px] font-mono border ${isCleared ? "bg-[var(--up)]/10 text-[var(--up)] border-[var(--up)]/30" : isSkipped ? "bg-[var(--text-muted)]/10 text-[var(--text-muted)] border-[var(--text-muted)]/20 italic" : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border)]"}`}
                    >
                      {t} {isSkipped && "(skipped)"}
                    </span>
                  );
                })}
              </div>

              {(status === "idle" || status === "confirming") && (
                <div className="flex flex-col gap-3">
                  {status === "idle" ? (
                    <button
                      className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[var(--down)] hover:bg-[var(--down)]/90 text-white font-semibold text-sm cursor-pointer transition-colors shadow-sm w-fit"
                      onClick={() => setStatus("confirming")}
                    >
                      <Trash2 size={15} /> Clear All Tables
                    </button>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5 py-3 px-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm">
                        <AlertTriangle size={17} className="text-amber-500 shrink-0" />
                        <span>Are you sure? This will permanently delete all data.</span>
                      </div>
                      <div className="flex gap-3">
                        <button
                          className="inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-lg bg-[var(--down)] hover:bg-[var(--down)]/90 text-white font-semibold text-sm cursor-pointer transition-colors shadow-sm"
                          onClick={handleClearDb}
                        >
                          Yes, clear everything
                        </button>
                        <button
                          className="inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] font-medium text-sm cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                          onClick={() => setStatus("idle")}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {status === "loading" && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
                  <Loader2 size={18} className="text-[var(--accent)] animate-spin" />
                  <span className="text-[var(--text-secondary)]">Clearing all tables…</span>
                </div>
              )}

              {status === "success" && (
                <div className="flex flex-col items-start gap-3 p-4 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-[var(--up)]" />
                    <span className="text-[var(--up)] font-semibold">Database cleared successfully</span>
                  </div>
                  <p className="text-[var(--text-secondary)] text-[13px] m-0">
                    {clearedTables.length} tables truncated. {skippedTables.length > 0 && `${skippedTables.length} missing.`}
                  </p>
                  <button
                    className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium text-sm cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                    onClick={() => setStatus("idle")}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "check" && (
          <div className="flex flex-col gap-6">
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col gap-5 shadow-sm">
              <div className="flex items-center gap-2.5">
                <ListChecks size={18} className="text-[var(--accent)]" />
                <span className="font-semibold text-base text-[var(--text-primary)] flex-1">Find Duplicated Tweets</span>
              </div>
              <p className="m-0 text-[var(--text-secondary)] text-[14px] leading-relaxed">
                Search for a profile to see if any tweets (with the exact same raw text) were saved multiple times under different tweet IDs.
              </p>

              <div className="relative">
                <div className="flex items-center gap-2.5 py-2.5 px-3.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
                  <Search size={15} className="text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={checkSearchQuery}
                    onChange={(e) => {
                      setCheckSearchQuery(e.target.value);
                      setSelectedCheckProfile(null);
                      setCheckDataResult(null);
                    }}
                    placeholder="Search profile by username..."
                    className="flex-1 bg-transparent border-none text-[var(--text-primary)] text-sm outline-none placeholder-[var(--text-muted)]"
                  />
                  {isCheckSearching && <Loader2 size={15} className="text-[var(--text-secondary)] animate-spin" />}
                </div>

                {checkSearchResults.length > 0 && !selectedCheckProfile && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden z-10 max-h-[200px] overflow-y-auto shadow-xl">
                    {checkSearchResults.map((p) => (
                      <div
                        key={p.username}
                        className="flex items-center gap-3 py-2.5 px-3.5 cursor-pointer border-b border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
                        onClick={() => {
                          setSelectedCheckProfile(p.username);
                          setCheckSearchQuery(p.username);
                          setCheckSearchResults([]);
                          handleCheckDuplicates(p.username);
                        }}
                      >
                        {p.profile_image_url && <img src={p.profile_image_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />}
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-[var(--text-primary)] truncate">{p.display_name || p.username}</span>
                          <span className="text-xs text-[var(--text-secondary)]">@{p.username}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {checkDataStatus === "loading" && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
                  <Loader2 size={18} className="text-[var(--accent)] animate-spin" />
                  <span className="text-[var(--text-secondary)]">Checking database for duplicates…</span>
                </div>
              )}

              {checkDataStatus === "success" && checkDataResult && (
                <div className="flex flex-col gap-4 mt-2">
                  <div className={`flex items-center gap-3 p-4 rounded-lg border ${checkDataResult.totalExtraCopies > 0 ? "bg-[var(--down)]/5 border-[var(--down)]/20 text-[var(--down)]" : "bg-[var(--up)]/5 border-[var(--up)]/20 text-[var(--up)]"}`}>
                    {checkDataResult.totalExtraCopies > 0 ? (
                      <AlertTriangle size={18} className="shrink-0" />
                    ) : (
                      <CheckCircle2 size={18} className="shrink-0" />
                    )}
                    <div>
                      <span className="font-semibold block text-sm">
                        {checkDataResult.totalExtraCopies > 0
                          ? `Found ${checkDataResult.totalExtraCopies} extra duplicated tweets across ${checkDataResult.totalDuplicateGroups} groups.`
                          : "No duplicate tweets found! The data is clean."}
                      </span>
                    </div>
                  </div>

                  {checkDataResult.duplicates?.length > 0 && (
                    <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {checkDataResult.duplicates.map((dup: any, i: number) => (
                        <div key={i} className="border border-[var(--border)] bg-[var(--bg-subtle)] p-4 rounded-lg flex flex-col gap-3">
                          <div className="flex justify-between items-center gap-2">
                            <span className="bg-[var(--down)]/10 text-[var(--down)] py-0.5 px-2.5 rounded font-semibold text-xs border border-[var(--down)]/20">{dup.count} copies</span>
                            <span className="text-xs text-[var(--text-secondary)]">{new Date(dup.first_seen).toLocaleDateString()} to {new Date(dup.last_seen).toLocaleDateString()}</span>
                          </div>
                          <p className="m-0 text-[13.5px] text-[var(--text-primary)] whitespace-pre-wrap bg-[var(--bg-surface)] border border-[var(--border)] p-3 rounded-md leading-relaxed">
                            {dup.raw_text}
                          </p>
                          <div className="text-xs text-[var(--text-secondary)] flex flex-wrap gap-2 items-center">
                            <strong className="text-[var(--text-primary)]">Tweet IDs:</strong>
                            {dup.tweet_ids.map((id: string) => (
                              <span key={id} className="bg-[var(--bg-surface)] border border-[var(--border)] py-0.5 px-1.5 rounded font-mono">{id}</span>
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
          <div className="flex flex-col gap-6">
            {/* Critical alert banner */}
            {healthData?.snapshot && healthData.snapshot.sessions.healthy === 0 && healthData.snapshot.sessions.total > 0 && (
              <div className="flex items-center gap-2.5 py-3 px-4 rounded-lg bg-[var(--down)]/10 border border-[var(--down)]/20 text-[var(--down)] text-sm">
                <AlertTriangle size={18} className="shrink-0" />
                <span className="font-semibold">ALL sessions rate-limited — Nitter is effectively down until limits reset.</span>
              </div>
            )}

            {/* Refresh button & last refreshed info */}
            <div className="flex justify-between items-center bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl py-4 px-6 shadow-sm">
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Telemetry Status</span>
                {healthLastRefreshed && (
                  <span className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Refreshed {timeAgo(healthLastRefreshed.toISOString())}
                  </span>
                )}
              </div>
              <button
                id="nitter-health-refresh-btn"
                onClick={() => fetchHealthData(true)}
                disabled={healthRefreshing}
                className="flex items-center gap-1.5 py-2 px-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-primary)] text-[13px] font-medium cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
              >
                <RefreshCw size={14} className={healthRefreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            {/* Loading / Error state */}
            {healthLoading && (
              <div className="flex items-center justify-center gap-2.5 p-12 text-[var(--text-secondary)]">
                <Loader2 size={18} className="animate-spin" />
                <span>Polling Nitter health endpoints…</span>
              </div>
            )}

            {healthError && (
              <div className="flex items-center gap-2.5 py-3 px-4 rounded-lg bg-[var(--down)]/10 border border-[var(--down)]/20 text-[var(--down)] text-sm">
                <XCircle size={18} className="shrink-0" />
                <span>Failed to load health data: {healthError}</span>
              </div>
            )}

            {!healthLoading && healthData && (
              <>
                {/* Metric grid */}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
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
                    icon={healthData.snapshot?.proxy.status === "healthy" ? <Wifi size={15} color="var(--up)" /> : <WifiOff size={15} color="var(--down)" />}
                    accent={statusColor(healthData.snapshot?.proxy.status ?? "unknown")}
                  />
                </div>

                {/* Circuit Breaker detail */}
                <CircuitBreakerBadge state={healthData.circuitBreaker} />

                {/* Session Pool card */}
                <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Server size={15} className="text-[var(--accent)]" />
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-[var(--text-secondary)]">Session Pool</span>
                    <span className="ml-auto text-[11px] text-[var(--text-muted)]">click to inspect</span>
                  </div>

                  {healthData.snapshot && healthData.snapshot.sessions.total > 0 && (
                    <div className="flex gap-[3px]">
                      {Array.from({ length: healthData.snapshot.sessions.total }).map((_, i) => {
                        const session = healthData.snapshot?.sessions.details[i];
                        const s = session?.status ?? "healthy";
                        return (
                          <div
                            key={i}
                            className="flex-1 h-1.5 rounded-sm transition-colors duration-300"
                            style={{ background: statusColor(s) }}
                            title={s}
                          />
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
                    {healthData.snapshot?.sessions.details && healthData.snapshot.sessions.details.length > 0
                      ? healthData.snapshot.sessions.details.map((s) => <SessionCard key={s.id} session={s} />)
                      : (
                        <div className="text-xs text-[var(--text-muted)] p-2">
                          Session details not available — ensure <code className="text-[var(--text-secondary)] bg-[var(--bg-subtle)] px-1 py-0.5 rounded font-mono">enableDebug = true</code> in nitter.conf
                        </div>
                      )
                    }
                  </div>
                </div>

                {/* Proxy health detailed card */}
                {healthData.snapshot?.proxy && (
                  <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-2.5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Globe size={15} className="text-[var(--accent)]" />
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-[var(--text-secondary)]">Proxy Connectivity</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <StatusDot status={healthData.snapshot.proxy.status} />
                      <span className="font-semibold capitalize text-sm" style={{ color: statusColor(healthData.snapshot.proxy.status) }}>
                        {healthData.snapshot.proxy.status}
                      </span>
                      {healthData.snapshot.proxy.latencyMs != null && (
                        <span className="text-xs text-[var(--text-secondary)] ml-auto">{healthData.snapshot.proxy.latencyMs}ms latency</span>
                      )}
                    </div>
                    {healthData.snapshot.proxy.error && (
                      <div className="text-[11px] text-[var(--down)] py-1.5 px-2.5 bg-[var(--down)]/10 border border-[var(--down)]/20 rounded-md">
                        {healthData.snapshot.proxy.error}
                      </div>
                    )}
                    <div className="flex gap-3 text-[11px] text-[var(--text-muted)]">
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> Checked {timeAgo(healthData.snapshot.proxy.lastChecked)}
                      </span>
                      {healthData.snapshot.proxy.consecutiveFailures > 0 && (
                        <span className="text-amber-500">{healthData.snapshot.proxy.consecutiveFailures} failures</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Event Log card */}
                <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-2.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-[var(--accent)]" />
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-[var(--text-secondary)]">Event Log</span>
                    {healthData.events.length > 0 && (
                      <span className="ml-auto text-[10px] text-[var(--text-muted)]">{healthData.events.length} events</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                    {healthData.events.length === 0 ? (
                      <div className="text-xs text-[var(--text-muted)] p-2">
                        No recent event logs
                      </div>
                    ) : healthData.events.map((evt) => (
                      <div key={evt.id} className="flex gap-2 py-2 px-2.5 rounded-md bg-[var(--bg-subtle)] items-start">
                        <span className="shrink-0 mt-0.5"><EventIcon type={evt.type} /></span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-[var(--text-primary)] leading-[1.4] break-words">{evt.message}</div>
                          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{timeAgo(evt.timestamp)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer status link references */}
                <div className="flex justify-between text-[11px] text-[var(--text-muted)] py-1 px-2">
                  <span>Nitter Host: <a href="http://localhost:8081" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">localhost:8081</a></span>
                  <span>Health API: <a href="http://localhost:8081/.health" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">/.health</a></span>
                  <span>Sessions API: <a href="http://localhost:8081/.sessions" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">/.sessions</a></span>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "sessions" && (
          <div className="flex flex-col gap-6">
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col gap-5 shadow-sm">
              <div className="flex items-center justify-between gap-4 flex-wrap border-b border-[var(--border)] pb-4">
                <div className="flex items-center gap-2.5">
                  <Database size={18} className="text-[var(--accent)]" />
                  <span className="font-semibold text-base text-[var(--text-primary)]">Append Nitter Cookie Session</span>
                </div>
                <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-subtle)] px-3 py-1.5 rounded-lg border border-[var(--border)] font-mono">
                  Path: <span className="text-[var(--accent)]">{sessionsFilePath || "Loading..."}</span>
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)] m-0 leading-relaxed">
                Cleanly appends a cookie session object to your Nitter sessions JSONL file without altering existing lines. The <code className="text-[var(--accent)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded font-mono">kind</code> is set to <code className="text-[var(--up)] font-mono">"cookie"</code> and <code className="text-[var(--accent)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded font-mono">id</code> is auto-incremented to <code className="text-[var(--up)] font-mono">"{nextSessionId}"</code>.
              </p>

              {sessionsError && (
                <div className="bg-[var(--down)]/10 border border-[var(--down)]/20 rounded-xl p-4 text-[var(--down)] text-sm flex items-center gap-3">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>{sessionsError}</span>
                </div>
              )}

              {sessionSuccessMsg && (
                <div className="bg-[var(--up)]/10 border border-[var(--up)]/20 rounded-xl p-4 text-[var(--up)] text-sm flex items-center gap-3">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>{sessionSuccessMsg}</span>
                </div>
              )}

              <form onSubmit={handleAddSession} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">Username</label>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="e.g. sammie859codes"
                      className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)] placeholder-[var(--text-muted)] transition-colors"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">auth_token</label>
                    <input
                      type="text"
                      value={newAuthToken}
                      onChange={(e) => setNewAuthToken(e.target.value)}
                      placeholder="e.g. 1322b5c26dc1909fc..."
                      className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)] font-mono placeholder-[var(--text-muted)] transition-colors"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">ct0</label>
                    <input
                      type="text"
                      value={newCt0}
                      onChange={(e) => setNewCt0(e.target.value)}
                      placeholder="e.g. 08bf2d04db5deb5..."
                      className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)] font-mono placeholder-[var(--text-muted)] transition-colors"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={sessionSubmitting || sessionsLoading}
                    className="bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white font-semibold text-sm px-6 py-2.5 rounded-lg inline-flex items-center gap-2 cursor-pointer transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sessionSubmitting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Appending...
                      </>
                    ) : (
                      <>
                        <Database size={15} />
                        Append to sessions.jsonl
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Edit Session Card */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col gap-5 shadow-sm">
              <div className="flex items-center justify-between gap-4 flex-wrap border-b border-[var(--border)] pb-4">
                <div className="flex items-center gap-2.5">
                  <Edit3 size={18} className="text-[var(--accent)]" />
                  <span className="font-semibold text-base text-[var(--text-primary)]">Edit Existing Session Tokens</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={editingSessionId}
                    onChange={(e) => handleSelectSessionForEdit(e.target.value)}
                    className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[var(--accent)] transition-colors cursor-pointer font-mono"
                  >
                    <option value="">-- Choose session to edit --</option>
                    {sessionsList.map((s) => (
                      <option key={s.id} value={s.id}>
                        #{s.id} - @{s.username}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)] m-0 leading-relaxed">
                Select an existing entry from your file above (or click <code className="text-[var(--accent)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded font-mono">Edit</code> in the list below) to modify its <code className="text-[var(--accent)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded font-mono">auth_token</code> or <code className="text-[var(--accent)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded font-mono">ct0</code> cookies without creating duplicate entries.
              </p>

              {editingError && (
                <div className="bg-[var(--down)]/10 border border-[var(--down)]/20 rounded-xl p-4 text-[var(--down)] text-sm flex items-center gap-3">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>{editingError}</span>
                </div>
              )}

              {editingSuccessMsg && (
                <div className="bg-[var(--up)]/10 border border-[var(--up)]/20 rounded-xl p-4 text-[var(--up)] text-sm flex items-center gap-3">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>{editingSuccessMsg}</span>
                </div>
              )}

              {editingSessionId ? (
                <form onSubmit={handleUpdateSession} className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[var(--text-secondary)]">Target Username</label>
                      <input
                        type="text"
                        value={
                          sessionsList.find((s) => String(s.id) === String(editingSessionId))?.username
                            ? `@${sessionsList.find((s) => String(s.id) === String(editingSessionId))?.username} (#${editingSessionId})`
                            : ""
                        }
                        disabled
                        className="bg-[var(--bg-subtle)]/50 border border-[var(--border)] text-[var(--text-muted)] rounded-lg px-3.5 py-2.5 text-sm font-mono cursor-not-allowed"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[var(--text-secondary)]">New auth_token</label>
                      <input
                        type="text"
                        value={editingAuthToken}
                        onChange={(e) => setEditingAuthToken(e.target.value)}
                        placeholder="Paste updated auth_token..."
                        className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)] font-mono placeholder-[var(--text-muted)] transition-colors"
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[var(--text-secondary)]">New ct0</label>
                      <input
                        type="text"
                        value={editingCt0}
                        onChange={(e) => setEditingCt0(e.target.value)}
                        placeholder="Paste updated ct0..."
                        className="bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)] font-mono placeholder-[var(--text-muted)] transition-colors"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => handleSelectSessionForEdit("")}
                      className="bg-[var(--bg-subtle)] hover:bg-[var(--border)] text-[var(--text-secondary)] font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={editingSubmitting || sessionsLoading}
                      className="bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white font-semibold text-sm px-6 py-2.5 rounded-lg inline-flex items-center gap-2 cursor-pointer transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {editingSubmitting ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={15} />
                          Update Tokens
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="py-6 text-center text-sm text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-xl bg-[var(--bg-subtle)]/30">
                  Select a session from the dropdown above or click <strong className="text-[var(--text-secondary)]">Edit</strong> on any entry in the existing sessions list below to modify its cookies.
                </div>
              )}
            </div>

            {/* Existing Sessions Table / List */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 flex flex-col gap-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="font-semibold text-base text-[var(--text-primary)]">
                  Existing Sessions in File ({sessionsList.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReindexIds}
                    disabled={sessionsLoading || reindexing || sessionsList.length === 0}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer bg-[var(--bg-subtle)] border border-[var(--border)] px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    title="Re-number all IDs sequentially starting from 1 without altering any session data"
                  >
                    {reindexing ? (
                      <Loader2 size={12} className="animate-spin text-[var(--accent)]" />
                    ) : (
                      <ListChecks size={12} className="text-[var(--accent)]" />
                    )}
                    Refresh IDs
                  </button>
                  <button
                    type="button"
                    onClick={fetchSessionsData}
                    disabled={sessionsLoading || reindexing}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer bg-[var(--bg-subtle)] border border-[var(--border)] px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={12} className={sessionsLoading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                </div>
              </div>

              {sessionsLoading ? (
                <div className="py-8 text-center text-[var(--text-secondary)] text-sm inline-flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Loading sessions...
                </div>
              ) : sessionsList.length === 0 ? (
                <div className="py-8 text-center text-[var(--text-muted)] text-sm border border-dashed border-[var(--border)] rounded-xl">
                  No sessions found in file yet. Add your first session above!
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                  {sessionsList.map((s, idx) => (
                    <div
                      key={idx}
                      className="bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="bg-[var(--accent)]/10 text-[var(--accent)] font-bold px-2 py-0.5 rounded font-mono shrink-0">
                          #{s.id}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-[var(--text-primary)] truncate">@{s.username}</span>
                          <span className="text-[var(--text-secondary)] font-mono">kind: {s.kind}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                        <div className="flex flex-col sm:items-end gap-1 font-mono text-[11px] text-[var(--text-secondary)] overflow-hidden">
                          <div className="truncate max-w-[220px]">
                            <span className="text-[var(--text-muted)]">auth:</span> {s.auth_token ? `${s.auth_token.slice(0, 10)}...${s.auth_token.slice(-6)}` : "—"}
                          </div>
                          <div className="truncate max-w-[220px]">
                            <span className="text-[var(--text-muted)]">ct0:</span> {s.ct0 ? `${s.ct0.slice(0, 10)}...${s.ct0.slice(-6)}` : "—"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectSessionForEdit(s.id)}
                          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            String(editingSessionId) === String(s.id)
                              ? "bg-[var(--accent)] text-white shadow-sm"
                              : "bg-[var(--bg-surface)] hover:bg-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]"
                          }`}
                        >
                          <Edit3 size={13} />
                          {String(editingSessionId) === String(s.id) ? "Editing" : "Edit"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes pulse-dot { 
          0% { box-shadow: 0 0 0 0 rgba(63,185,80,0.5); } 
          70% { box-shadow: 0 0 0 6px rgba(63,185,80,0); } 
          100% { box-shadow: 0 0 0 0 rgba(63,185,80,0); } 
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
