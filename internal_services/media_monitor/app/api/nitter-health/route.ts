import { NextResponse } from "next/server";
import {
  getLatestSnapshot,
  getRecentEvents,
  forceHealthPoll,
  startHealthMonitoring,
  isMonitoring,
} from "@/services/nitterHealthService";
import {
  getCircuitBreakerState,
  getRequestStats,
} from "@/services/nitterService";

export const dynamic = "force-dynamic";

export async function GET() {
  // Auto-start monitoring on first dashboard visit
  if (!isMonitoring()) {
    startHealthMonitoring();
  }

  // If no snapshot yet, force an immediate poll
  let snapshot = getLatestSnapshot();
  if (!snapshot) {
    snapshot = await forceHealthPoll();
  }

  const circuitBreaker = getCircuitBreakerState();
  const requestStats = getRequestStats();
  const events = getRecentEvents(50);

  return NextResponse.json({
    snapshot,
    circuitBreaker,
    requestStats,
    events,
    monitoring: isMonitoring(),
  });
}
