/**
 * 固定視窗速率限制。
 *
 * 邀請 token 是唯一的憑證，joinByInvite 等於一個可以無限猜的入口，
 * 所以 Functions 這端要限速（見 CLAUDE.md「邀請 token」那一列）。
 *
 * 視窗計算是純函式，寫在這裡方便測；真正去 Firestore 讀寫的部分
 * 在 consumeRateLimit()，計數器存在 rateLimits/{bucket} 的一個交易裡。
 */

import type { Firestore } from 'firebase-admin/firestore';

export interface RateLimitConfig {
  /** 視窗長度（毫秒）。 */
  windowMs: number;
  /** 一個視窗內最多幾次。 */
  max: number;
}

export interface RateLimitCounter {
  windowStart: number;
  count: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** 寫回 Firestore 的新計數。 */
  next: RateLimitCounter;
  /** 視窗結束的時間，用來告訴呼叫端何時可以再試。 */
  retryAt: number;
  remaining: number;
}

/** 目前時間落在哪一個視窗的起點。 */
export function windowStartOf(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

/**
 * 純計算：給定既有計數與現在時間，決定這次請求放不放行。
 * current 為 null 代表這個 bucket 還沒有計數器。
 */
export function evaluateRateLimit(
  current: RateLimitCounter | null,
  now: number,
  config: RateLimitConfig,
): RateLimitDecision {
  const windowStart = windowStartOf(now, config.windowMs);
  const retryAt = windowStart + config.windowMs;
  const count = current !== null && current.windowStart === windowStart ? current.count : 0;

  if (count >= config.max) {
    return {
      allowed: false,
      next: { windowStart, count },
      retryAt,
      remaining: 0,
    };
  }

  return {
    allowed: true,
    next: { windowStart, count: count + 1 },
    retryAt,
    remaining: config.max - count - 1,
  };
}

/** joinByInvite / peekInvite 的限制：每個來源 10 分鐘內最多 10 次。 */
export const JOIN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 10 * 60 * 1000,
  max: 10,
};

/** 管理者操作邀請的限制：每位使用者 10 分鐘內最多 30 次。 */
export const MANAGE_RATE_LIMIT: RateLimitConfig = {
  windowMs: 10 * 60 * 1000,
  max: 30,
};

/**
 * 在一個交易裡讀出計數、判斷、寫回。
 * bucket 建議用「動作名稱:識別子」，例如 `joinByInvite:${uid}`。
 */
export async function consumeRateLimit(
  db: Firestore,
  bucket: string,
  config: RateLimitConfig,
  now: number,
): Promise<RateLimitDecision> {
  const docRef = db.collection('rateLimits').doc(encodeURIComponent(bucket));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const current = snap.exists ? (snap.data() as RateLimitCounter) : null;
    const decision = evaluateRateLimit(current, now, config);
    tx.set(docRef, { ...decision.next, updatedAt: now });
    return decision;
  });
}
