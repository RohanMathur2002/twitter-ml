const MINUTE_MS = 60_000;
const DEFAULT_TOTAL_DURATION_MS = 60 * MINUTE_MS;
const MIN_TOTAL_DURATION_MS = 10 * MINUTE_MS;
const MAX_TOTAL_DURATION_MS = 24 * 60 * MINUTE_MS;
const MIN_PHASE_ONE_MS = 5 * MINUTE_MS;
const MAX_PHASE_ONE_MS = 10 * MINUTE_MS;
const ESTIMATED_TWEETS_PER_REQUEST = 20;

export interface ScrapeScheduleInput {
  totalAllowedMs?: number;
  phaseOneTargetMs?: number;
  phaseOneElapsedMs?: number;
  estimatedTweetsRemaining: number;
  estimatedRequestCount?: number;
}

export interface ScrapeScheduleSlot {
  index: number;
  scheduledOffsetMs: number;
  delayMs: number;
  tempo: "burst" | "normal" | "cooldown";
}

export interface ScrapeExecutionPlan {
  totalAllowedMs: number;
  phaseOneTargetMs: number;
  phaseOneElapsedMs: number;
  remainingDurationMs: number;
  estimatedTweetsRemaining: number;
  estimatedRequestCount: number;
  averageRequestSpacingMs: number;
  slots: ScrapeScheduleSlot[];
}

export interface RequestPaceContext {
  phase: string;
  timeline?: string;
  page?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeDuration(durationMs?: number) {
  if (!Number.isFinite(durationMs) || !durationMs) return DEFAULT_TOTAL_DURATION_MS;
  return clamp(Math.round(durationMs), MIN_TOTAL_DURATION_MS, MAX_TOTAL_DURATION_MS);
}

export function calculatePhaseOneTargetMs(totalAllowedMs?: number) {
  const normalizedTotal = normalizeDuration(totalAllowedMs);
  return clamp(Math.round(normalizedTotal * 0.1), MIN_PHASE_ONE_MS, MAX_PHASE_ONE_MS);
}

export function estimateArchivalRequestCount(estimatedTweetsRemaining: number) {
  const tweetRequests = Math.ceil(Math.max(estimatedTweetsRemaining, 0) / ESTIMATED_TWEETS_PER_REQUEST);
  const verificationAndWindowOverhead = Math.ceil(tweetRequests * 0.18);
  return Math.max(1, tweetRequests + verificationAndWindowOverhead);
}

function weightedRandomWeight(index: number, total: number) {
  const position = total > 1 ? index / (total - 1) : 0;
  const dayShape = 0.85 + Math.sin(position * Math.PI * 2.4) * 0.18;
  const randomVariation = 0.65 + Math.random() * 0.8;
  return Math.max(0.2, dayShape * randomVariation);
}

function tempoForSlot(index: number, total: number): ScrapeScheduleSlot["tempo"] {
  if (total < 8) return "normal";
  if (index > 0 && index % 19 === 0) return "cooldown";
  if (index % 11 === 3 || index % 13 === 5) return "burst";
  return "normal";
}

function buildWeights(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const tempo = tempoForSlot(index, count);
    const base = weightedRandomWeight(index, count);
    if (tempo === "burst") return { tempo, weight: base * (0.35 + Math.random() * 0.25) };
    if (tempo === "cooldown") return { tempo, weight: base * (2.2 + Math.random() * 1.8) };
    return { tempo, weight: base };
  });
}

export function createScrapeExecutionPlan(input: ScrapeScheduleInput): ScrapeExecutionPlan {
  const totalAllowedMs = normalizeDuration(input.totalAllowedMs);
  const phaseOneTargetMs = clamp(
    input.phaseOneTargetMs ?? calculatePhaseOneTargetMs(totalAllowedMs),
    MIN_PHASE_ONE_MS,
    Math.min(MAX_PHASE_ONE_MS, totalAllowedMs)
  );
  const phaseOneElapsedMs = Math.max(0, Math.round(input.phaseOneElapsedMs ?? phaseOneTargetMs));
  const remainingDurationMs = Math.max(MINUTE_MS, totalAllowedMs - phaseOneElapsedMs);
  const estimatedTweetsRemaining = Math.max(0, Math.round(input.estimatedTweetsRemaining));
  const estimatedRequestCount = Math.max(
    1,
    Math.round(input.estimatedRequestCount ?? estimateArchivalRequestCount(estimatedTweetsRemaining))
  );
  const averageRequestSpacingMs = Math.round(remainingDurationMs / estimatedRequestCount);
  const weightedSlots = buildWeights(estimatedRequestCount);
  const totalWeight = weightedSlots.reduce((sum, slot) => sum + slot.weight, 0);

  let scheduledOffsetMs = 0;
  const slots = weightedSlots.map((slot, index) => {
    const delayMs = Math.max(1_000, Math.round((slot.weight / totalWeight) * remainingDurationMs));
    scheduledOffsetMs += delayMs;
    return {
      index: index + 1,
      scheduledOffsetMs,
      delayMs,
      tempo: slot.tempo,
    };
  });

  return {
    totalAllowedMs,
    phaseOneTargetMs,
    phaseOneElapsedMs,
    remainingDurationMs,
    estimatedTweetsRemaining,
    estimatedRequestCount,
    averageRequestSpacingMs,
    slots,
  };
}

export class ScrapeRequestScheduler {
  private readonly startedAt = Date.now();
  private requestIndex = 0;

  constructor(readonly plan: ScrapeExecutionPlan) {}

  async waitForTurn(context: RequestPaceContext) {
    const slot = this.plan.slots[this.requestIndex] ?? this.createOverflowSlot();
    this.requestIndex += 1;

    const elapsedMs = Date.now() - this.startedAt;
    const waitMs = Math.max(0, slot.scheduledOffsetMs - elapsedMs);
    if (waitMs > 0) {
      console.log(
        `[ScrapeScheduler] Waiting ${Math.round(waitMs / 1000)}s before ${context.phase} request ${this.requestIndex}/${this.plan.estimatedRequestCount} (${slot.tempo}${context.timeline ? `, ${context.timeline}` : ""}${context.page ? `, page ${context.page}` : ""}).`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private createOverflowSlot(): ScrapeScheduleSlot {
    const overflowIndex = this.requestIndex - this.plan.slots.length + 1;
    const delayMs = Math.max(5_000, Math.round(this.plan.averageRequestSpacingMs * (0.75 + Math.random() * 1.5)));
    const lastOffset = this.plan.slots[this.plan.slots.length - 1]?.scheduledOffsetMs ?? 0;
    return {
      index: this.requestIndex + 1,
      scheduledOffsetMs: lastOffset + overflowIndex * delayMs,
      delayMs,
      tempo: overflowIndex % 7 === 0 ? "cooldown" : "normal",
    };
  }
}
