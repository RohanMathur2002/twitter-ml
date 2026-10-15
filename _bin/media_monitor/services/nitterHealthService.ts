/**
 * Nitter Health Monitoring Service
 *
 * Polls the Nitter instance's /.health and /.sessions endpoints to provide
 * real-time visibility into session pool health, rate limit status, and proxy
 * connectivity. Designed to be consumed by the /nitter-health dashboard.
 */

const NITTER_HOST = "http://localhost:8081";
const POLL_INTERVAL_MS = 30_000; // 30 seconds
const PROXY_CHECK_INTERVAL_MS = 60_000; // 60 seconds

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionHealth {
  total: number;
  limited: number;
  oldest: string;
  newest: string;
  average: string;
}

export interface RequestHealth {
  total: number;
  apis: Record<string, number>;
}

export interface NitterHealthResponse {
  sessions: SessionHealth;
  requests: RequestHealth;
}

export interface SessionDebugInfo {
  apis: Record<string, { remaining: number; reset: number }>;
  pending: number;
  limited?: boolean;
}

export interface NitterSessionsResponse {
  [sessionId: string]: SessionDebugInfo;
}

export type ProxyStatus = "healthy" | "degraded" | "down" | "unknown";

export interface ProxyHealth {
  status: ProxyStatus;
  latencyMs: number | null;
  lastChecked: Date | null;
  error: string | null;
  consecutiveFailures: number;
}

export interface SessionStatus {
  id: string;
  status: "healthy" | "limited" | "exhausted";
  pending: number;
  apis: Record<string, { remaining: number; reset: number; resetIn: string }>;
}

export type EventType =
  | "session_limited"
  | "session_recovered"
  | "all_sessions_limited"
  | "proxy_down"
  | "proxy_recovered"
  | "circuit_open"
  | "circuit_closed"
  | "nitter_unreachable"
  | "silent_rate_limit";

export interface HealthEvent {
  id: string;
  type: EventType;
  message: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

export interface HealthSnapshot {
  timestamp: Date;
  sessions: {
    total: number;
    healthy: number;
    limited: number;
    exhausted: number;
    details: SessionStatus[];
  };
  proxy: ProxyHealth;
  requests: RequestHealth;
  nitterReachable: boolean;
}

// ─── In-memory state ──────────────────────────────────────────────────────────

let latestSnapshot: HealthSnapshot | null = null;
const eventLog: HealthEvent[] = [];
const MAX_EVENTS = 200;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let proxyTimer: ReturnType<typeof setInterval> | null = null;
let previouslyLimitedSessions = new Set<string>();
let wasAllLimited = false;

const proxyState: ProxyHealth = {
  status: "unknown",
  latencyMs: null,
  lastChecked: null,
  error: null,
  consecutiveFailures: 0,
};

// ─── Event logging ────────────────────────────────────────────────────────────

export function pushEvent(type: EventType, message: string, data?: Record<string, unknown>) {
  const event: HealthEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    message,
    timestamp: new Date(),
    data,
  };
  eventLog.unshift(event);
  if (eventLog.length > MAX_EVENTS) eventLog.length = MAX_EVENTS;
  console.log(`[NitterHealth] 📋 ${type}: ${message}`);
}

// ─── Proxy health check ──────────────────────────────────────────────────────

async function checkProxyHealth(): Promise<void> {
  const start = Date.now();
  try {
    // Test by hitting a lightweight endpoint through Nitter
    // (Nitter itself proxies through the configured proxy to X)
    const response = await fetch(`${NITTER_HOST}/`, {
      signal: AbortSignal.timeout(10_000),
    });
    const latency = Date.now() - start;

    if (response.ok) {
      const prevStatus: ProxyStatus = proxyState.status;
      const newStatus: ProxyStatus = latency > 5000 ? "degraded" : "healthy";
      proxyState.status = newStatus;
      proxyState.latencyMs = latency;
      proxyState.error = null;
      proxyState.consecutiveFailures = 0;
      proxyState.lastChecked = new Date();

      if (prevStatus === "down") {
        pushEvent("proxy_recovered", `Proxy recovered (latency: ${latency}ms)`);
      }
    } else {
      proxyState.consecutiveFailures++;
      proxyState.status = proxyState.consecutiveFailures >= 3 ? "down" : "degraded";
      proxyState.error = `HTTP ${response.status}`;
      proxyState.lastChecked = new Date();

      if (proxyState.status === "down" && proxyState.consecutiveFailures === 3) {
        pushEvent("proxy_down", `Proxy is down after ${proxyState.consecutiveFailures} consecutive failures`, {
          lastError: proxyState.error,
        });
      }
    }
  } catch (err) {
    const latency = Date.now() - start;
    proxyState.consecutiveFailures++;
    proxyState.status = proxyState.consecutiveFailures >= 3 ? "down" : "degraded";
    proxyState.latencyMs = latency;
    proxyState.error = err instanceof Error ? err.message : "Unknown error";
    proxyState.lastChecked = new Date();

    if (proxyState.status === "down" && proxyState.consecutiveFailures === 3) {
      pushEvent("proxy_down", `Proxy unreachable: ${proxyState.error}`);
    }
  }
}

// ─── Health polling ───────────────────────────────────────────────────────────

function formatResetIn(resetEpoch: number): string {
  const diff = resetEpoch - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "now";
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
}

async function pollHealth(): Promise<HealthSnapshot | null> {
  try {
    // Fetch both endpoints in parallel
    const [healthRes, sessionsRes] = await Promise.allSettled([
      fetch(`${NITTER_HOST}/.health`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${NITTER_HOST}/.sessions`, { signal: AbortSignal.timeout(5000) }),
    ]);

    if (healthRes.status !== "fulfilled" || !healthRes.value.ok) {
      pushEvent("nitter_unreachable", "Cannot reach Nitter /.health endpoint");
      return null;
    }

    const healthData: NitterHealthResponse = await healthRes.value.json();

    // Parse session details if available
    let sessionDetails: SessionStatus[] = [];
    let sessionsData: NitterSessionsResponse = {};

    if (sessionsRes.status === "fulfilled" && sessionsRes.value.ok) {
      sessionsData = await sessionsRes.value.json();

      sessionDetails = Object.entries(sessionsData).map(([id, info]) => {
        const isLimited = info.limited === true;
        const isExhausted = isLimited && Object.values(info.apis).every(
          (api) => api.remaining <= 0
        );

        const apis: SessionStatus["apis"] = {};
        for (const [apiName, apiData] of Object.entries(info.apis)) {
          apis[apiName] = {
            remaining: apiData.remaining,
            reset: apiData.reset,
            resetIn: formatResetIn(apiData.reset),
          };
        }

        return {
          id,
          status: isExhausted ? "exhausted" as const : isLimited ? "limited" as const : "healthy" as const,
          pending: info.pending,
          apis,
        };
      });
    }

    const healthyCount = healthData.sessions.total - healthData.sessions.limited;
    const limitedCount = healthData.sessions.limited;
    const exhaustedCount = sessionDetails.filter((s) => s.status === "exhausted").length;

    // Detect state changes and emit events
    const currentlyLimited = new Set(
      sessionDetails.filter((s) => s.status === "limited" || s.status === "exhausted").map((s) => s.id)
    );

    // New sessions that became limited
    for (const id of currentlyLimited) {
      if (!previouslyLimitedSessions.has(id)) {
        pushEvent("session_limited", `Session ${id} is now rate-limited`, { sessionId: id });
      }
    }

    // Sessions that recovered
    for (const id of previouslyLimitedSessions) {
      if (!currentlyLimited.has(id)) {
        pushEvent("session_recovered", `Session ${id} recovered from rate limit`, { sessionId: id });
      }
    }

    // All sessions limited
    const allLimited = healthData.sessions.total > 0 && healthyCount === 0;
    if (allLimited && !wasAllLimited) {
      pushEvent("all_sessions_limited", `⚠️ ALL ${healthData.sessions.total} sessions are rate-limited! Nitter is effectively down.`);
    }

    previouslyLimitedSessions = currentlyLimited;
    wasAllLimited = allLimited;

    const snapshot: HealthSnapshot = {
      timestamp: new Date(),
      sessions: {
        total: healthData.sessions.total,
        healthy: healthyCount,
        limited: limitedCount - exhaustedCount,
        exhausted: exhaustedCount,
        details: sessionDetails,
      },
      proxy: { ...proxyState },
      requests: healthData.requests,
      nitterReachable: true,
    };

    latestSnapshot = snapshot;
    return snapshot;
  } catch (err) {
    console.error("[NitterHealth] Failed to poll health:", err);
    pushEvent("nitter_unreachable", `Health poll failed: ${err instanceof Error ? err.message : "Unknown"}`);
    return null;
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function startHealthMonitoring() {
  if (pollTimer) return; // Already running
  console.log("[NitterHealth] 🚀 Starting health monitoring (poll every 30s, proxy every 60s)");

  // Initial poll
  pollHealth();
  checkProxyHealth();

  pollTimer = setInterval(pollHealth, POLL_INTERVAL_MS);
  proxyTimer = setInterval(checkProxyHealth, PROXY_CHECK_INTERVAL_MS);
}

export function stopHealthMonitoring() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (proxyTimer) {
    clearInterval(proxyTimer);
    proxyTimer = null;
  }
  console.log("[NitterHealth] 🛑 Stopped health monitoring");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getLatestSnapshot(): HealthSnapshot | null {
  return latestSnapshot;
}

export function getRecentEvents(limit = 50): HealthEvent[] {
  return eventLog.slice(0, limit);
}

export function getProxyHealth(): ProxyHealth {
  return { ...proxyState };
}

/** Force an immediate health poll (e.g. when the dashboard first loads) */
export async function forceHealthPoll(): Promise<HealthSnapshot | null> {
  return pollHealth();
}

/** Force an immediate proxy check */
export async function forceProxyCheck(): Promise<ProxyHealth> {
  await checkProxyHealth();
  return { ...proxyState };
}

export function isMonitoring(): boolean {
  return pollTimer !== null;
}
