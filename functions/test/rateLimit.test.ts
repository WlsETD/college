import { describe, expect, it } from 'vitest';

import {
  JOIN_RATE_LIMIT,
  MANAGE_RATE_LIMIT,
  evaluateRateLimit,
  windowStartOf,
  type RateLimitCounter,
} from '../src/lib/rateLimit';

const CONFIG = { windowMs: 60_000, max: 3 };
const T = 1_770_000_000_000;

describe('windowStartOf', () => {
  it('對齊到視窗邊界', () => {
    expect(windowStartOf(T + 1, CONFIG.windowMs)).toBe(windowStartOf(T, CONFIG.windowMs));
  });

  it('跨過邊界就換一個視窗', () => {
    const start = windowStartOf(T, CONFIG.windowMs);
    expect(windowStartOf(start + CONFIG.windowMs, CONFIG.windowMs)).toBe(
      start + CONFIG.windowMs,
    );
  });
});

describe('evaluateRateLimit', () => {
  it('第一次請求放行', () => {
    const d = evaluateRateLimit(null, T, CONFIG);
    expect(d.allowed).toBe(true);
    expect(d.next.count).toBe(1);
    expect(d.remaining).toBe(2);
  });

  it('連續請求會累加，到上限就擋下來', () => {
    let counter: RateLimitCounter | null = null;
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      const d = evaluateRateLimit(counter, T, CONFIG);
      results.push(d.allowed);
      counter = d.next;
    }
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('被擋下來時計數不會再往上加', () => {
    const full: RateLimitCounter = { windowStart: windowStartOf(T, CONFIG.windowMs), count: 3 };
    const d = evaluateRateLimit(full, T, CONFIG);
    expect(d.allowed).toBe(false);
    expect(d.next.count).toBe(3);
    expect(d.remaining).toBe(0);
  });

  it('進到下一個視窗就重新計算', () => {
    const full: RateLimitCounter = { windowStart: windowStartOf(T, CONFIG.windowMs), count: 3 };
    const next = evaluateRateLimit(full, T + CONFIG.windowMs, CONFIG);
    expect(next.allowed).toBe(true);
    expect(next.next.count).toBe(1);
  });

  it('retryAt 落在目前視窗的結尾', () => {
    const d = evaluateRateLimit(null, T, CONFIG);
    expect(d.retryAt).toBe(windowStartOf(T, CONFIG.windowMs) + CONFIG.windowMs);
    expect(d.retryAt).toBeGreaterThan(T);
  });

  it('舊視窗留下來的計數不會被算進來', () => {
    const stale: RateLimitCounter = { windowStart: 0, count: 999 };
    expect(evaluateRateLimit(stale, T, CONFIG).allowed).toBe(true);
  });
});

describe('預設設定', () => {
  it('加入邀請的限制比管理者操作嚴格', () => {
    expect(JOIN_RATE_LIMIT.max).toBeLessThan(MANAGE_RATE_LIMIT.max);
  });

  it('兩者的視窗都是有限的正數', () => {
    for (const config of [JOIN_RATE_LIMIT, MANAGE_RATE_LIMIT]) {
      expect(config.windowMs).toBeGreaterThan(0);
      expect(config.max).toBeGreaterThan(0);
    }
  });
});
