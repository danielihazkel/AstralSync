import { createChatLimiter } from "./chatLimiter";

/**
 * Shared spend cap for the *stored* AI generation routes — natal reading,
 * Mazal reading, Life Story, period forecasts and the synastry reading.
 *
 * Each of those is guarded by a DB unique constraint ("generate once per
 * snapshot / period / pair"), which looks like a cost control but is not
 * one: every route also has a DELETE that discards the row and frees the
 * slot, so discard-then-regenerate is an unbounded loop against a paid API.
 * The constraint bounds how many rows exist, never how many calls are made.
 *
 * This bounds the calls. It is deliberately generous — the limit is an abuse
 * backstop, not a quota, and normal use (generate, read, maybe regenerate
 * once or twice after editing a chart) never approaches it.
 *
 * In-memory and single-process, exactly like lib/chatLimiter: this app runs
 * as one local process. A multi-instance deployment needs a shared store,
 * noted for the Phase 4 gate alongside real per-route rate limiting.
 */

/** Stored generations allowed per key per window. */
export const GENERATION_HOURLY_LIMIT = 20;
export const GENERATION_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function build() {
  return createChatLimiter({
    limit: GENERATION_HOURLY_LIMIT,
    windowMs: GENERATION_LIMIT_WINDOW_MS,
  });
}

let limiter = build();

/**
 * Drop the accumulated window. Exists because the limiter is a module-level
 * singleton shared by every route test in a Vitest process: without it, the
 * suite would start failing once the POST tests across all five generation
 * routes outnumbered GENERATION_HOURLY_LIMIT, for a reason that would look
 * nothing like the change that caused it. Not called by application code.
 */
export function resetGenerationLimiter(): void {
  limiter = build();
}

/**
 * Spend one generation for `key` (a profile id, or pairKey() for synastry).
 * Returns null when allowed, or the seconds to wait when not.
 */
export function consumeGeneration(key: number): number | null {
  const verdict = limiter.consume(key);
  if (verdict.allowed) return null;
  return Math.ceil(verdict.retryAfterMs / 1000);
}

/**
 * A stable numeric key for an unordered profile pair, so the synastry route
 * can share the per-profile limiter. Cantor pairing over the ordered pair —
 * collision-free for non-negative ids, which is what matters here.
 */
export function pairKey(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return ((lo + hi) * (lo + hi + 1)) / 2 + hi;
}
