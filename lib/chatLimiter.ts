/**
 * Rolling-window rate limiter for the chat route. The per-conversation
 * CHAT_MAX_TURNS cap lives in client-supplied history, which a hostile
 * client resets at will — this is the server-side abuse backstop bounding
 * LLM spend per profile per hour regardless of what the client claims.
 *
 * In-memory on purpose: the app runs as a single local process. A
 * multi-instance deployment would need a shared store (noted for the
 * Phase 4 gate alongside real per-route rate limiting).
 */

export interface ChatLimiter {
  /** Try to spend one question for `profileId`. */
  consume(profileId: number): { allowed: boolean; retryAfterMs: number };
}

export function createChatLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  /** Injectable clock for tests. */
  now?: () => number;
}): ChatLimiter {
  // Per profile: timestamps of questions inside the rolling window.
  const spent = new Map<number, number[]>();

  return {
    consume(profileId) {
      const t = now();
      const cutoff = t - windowMs;
      const kept = (spent.get(profileId) ?? []).filter((ts) => ts > cutoff);

      // Lazy sweep: drop profiles whose windows have fully expired so the
      // map doesn't grow with every profile ever chatted about.
      for (const [id, stamps] of spent) {
        if (id !== profileId && stamps.every((ts) => ts <= cutoff)) {
          spent.delete(id);
        }
      }

      if (kept.length >= limit) {
        spent.set(profileId, kept);
        // The window frees a slot when its oldest question ages out.
        return { allowed: false, retryAfterMs: kept[0] + windowMs - t };
      }
      kept.push(t);
      spent.set(profileId, kept);
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
