/**
 * 邀請 token 的產生、雜湊與驗證。
 *
 * 這個檔案刻意不碰 Firestore，全部是純函式，方便用 Vitest 覆蓋。
 * 安全性上的三個要求（見 CLAUDE.md「已定案的技術決策」）：
 *   1. token 至少 128 bit
 *   2. Firestore 只存 SHA-256 hash，明碼只出現在連結裡
 *   3. 比對 hash 時用定時比較，不要用 ===
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** token 的位元組數。24 bytes = 192 bit，base64url 後是 32 個字元。 */
export const TOKEN_BYTES = 24;

/** base64url 字元集：A–Z a–z 0–9 - _ */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/** 產生一組新的明碼 token。 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** token → SHA-256 hex。存進 Firestore 的就是這個。 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * 先擋掉長度或字元集明顯不對的輸入，免得每個亂打的請求都去查一次 Firestore。
 */
export function looksLikeToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

/** 定時比較兩個 hex 字串，避免用比較時間反推 hash。 */
export function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** 邀請文件裡跟「還能不能用」有關的欄位。 */
export interface InviteState {
  expiresAt: number | null;
  revokedAt: number | null;
  deletedAt: number | null;
}

export type InviteRejection = 'revoked' | 'expired' | 'deleted';

/**
 * 判斷一張邀請在 now 這個時間點能不能用。
 * 回傳 null 代表可用，否則回傳被拒絕的原因。
 */
export function inviteRejection(invite: InviteState, now: number): InviteRejection | null {
  if (invite.deletedAt !== null) return 'deleted';
  if (invite.revokedAt !== null) return 'revoked';
  if (invite.expiresAt !== null && invite.expiresAt <= now) return 'expired';
  return null;
}

export function isInviteUsable(invite: InviteState, now: number): boolean {
  return inviteRejection(invite, now) === null;
}

/**
 * 到期時間的合法範圍：現在之後，且不超過 maxDays 天。
 * null 代表永不過期，是允許的。
 */
export const MAX_EXPIRY_DAYS = 365;

export function normalizeExpiresAt(
  value: unknown,
  now: number,
  maxDays = MAX_EXPIRY_DAYS,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError('expiresAt 必須是毫秒時間戳或 null');
  }
  const ms = Math.floor(value);
  if (ms <= now) {
    throw new RangeError('expiresAt 必須是未來的時間');
  }
  if (ms > now + maxDays * 24 * 60 * 60 * 1000) {
    throw new RangeError(`expiresAt 不可超過 ${maxDays} 天`);
  }
  return ms;
}

/** 邀請連結。明碼 token 只出現在這裡。 */
export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/join/${token}`;
}
