/**
 * 邀請連結相關的 Callable。
 *
 * 為什麼一定要走後端（見 docs/01_spec_section3.md 第 3.3 節）：
 *   - invites 文件的讀寫在安全規則裡四種角色全部拒絕，只由 Admin SDK 存取。
 *   - 非成員無法通過規則寫 groups/{gid}.roles，所以「用邀請連結加入」
 *     不可能在前端完成。
 *
 * 明碼 token 只在 createInvite / rotateInvite 的回傳值裡出現一次，
 * Firestore 只存 SHA-256 hash，所以連結關掉就再也拿不回來，只能重新產生。
 */

import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

import { db } from './firebase';
import { CALLABLE } from './options';
import { requireAuth, requireManager, requireString } from './lib/guards';
import {
  generateToken,
  hashEquals,
  hashToken,
  inviteRejection,
  looksLikeToken,
  normalizeExpiresAt,
  type InviteState,
} from './lib/invite';
import {
  consumeRateLimit,
  JOIN_RATE_LIMIT,
  MANAGE_RATE_LIMIT,
  type RateLimitConfig,
} from './lib/rateLimit';

/** 時間戳可能是 Timestamp（Firestore）或 number（測試種子資料）。 */
function toMillis(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number') return value;
  return null;
}

function inviteState(data: DocumentData): InviteState {
  return {
    expiresAt: toMillis(data.expiresAt),
    revokedAt: toMillis(data.revokedAt),
    deletedAt: toMillis(data.deletedAt),
  };
}

function parseExpiresAt(value: unknown, now: number): number | null {
  try {
    return normalizeExpiresAt(value, now);
  } catch (err) {
    throw new HttpsError('invalid-argument', (err as Error).message);
  }
}

async function limit(bucket: string, config: RateLimitConfig, now: number): Promise<void> {
  const decision = await consumeRateLimit(db, bucket, config, now);
  if (!decision.allowed) {
    throw new HttpsError(
      'resource-exhausted',
      `操作太頻繁，請在 ${new Date(decision.retryAt).toISOString()} 之後再試`,
    );
  }
}

interface InviteWriteResult {
  inviteId: string;
  /** 明碼 token，只會在這裡出現一次。 */
  token: string;
  expiresAt: number | null;
}

async function issueInvite(
  gid: string,
  uid: string,
  expiresAt: number | null,
): Promise<InviteWriteResult> {
  const token = generateToken();
  const ref = db.collection(`groups/${gid}/invites`).doc();
  await ref.set({
    tokenHash: hashToken(token),
    role: 'viewer',
    expiresAt: expiresAt === null ? null : Timestamp.fromMillis(expiresAt),
    revokedAt: null,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  return { inviteId: ref.id, token, expiresAt };
}

/** 把該群組目前還有效的邀請全部標成已撤銷。 */
async function revokeActiveInvites(gid: string, now: number): Promise<number> {
  const snaps = await db.collection(`groups/${gid}/invites`).where('revokedAt', '==', null).get();
  if (snaps.empty) return 0;

  const batch = db.batch();
  const revokedAt = Timestamp.fromMillis(now);
  for (const snap of snaps.docs) {
    batch.update(snap.ref, { revokedAt, updatedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  return snaps.size;
}

// -----------------------------------------------------------------------------
// 建立邀請連結
// -----------------------------------------------------------------------------

export const createInvite = onCall<{ gid?: unknown; expiresAt?: unknown }>(CALLABLE, async (req) => {
  const uid = requireAuth(req);
  const gid = requireString(req.data?.gid, 'gid');
  const now = Date.now();

  await requireManager(gid, uid);
  await limit(`createInvite:${uid}`, MANAGE_RATE_LIMIT, now);

  const expiresAt = parseExpiresAt(req.data?.expiresAt, now);
  return issueInvite(gid, uid, expiresAt);
});

// -----------------------------------------------------------------------------
// 重新產生 token（舊連結立即失效）
// -----------------------------------------------------------------------------

export const rotateInvite = onCall<{ gid?: unknown; expiresAt?: unknown }>(CALLABLE, async (req) => {
  const uid = requireAuth(req);
  const gid = requireString(req.data?.gid, 'gid');
  const now = Date.now();

  await requireManager(gid, uid);
  await limit(`rotateInvite:${uid}`, MANAGE_RATE_LIMIT, now);

  const expiresAt = parseExpiresAt(req.data?.expiresAt, now);
  const revoked = await revokeActiveInvites(gid, now);
  const created = await issueInvite(gid, uid, expiresAt);
  return { ...created, revoked };
});

// -----------------------------------------------------------------------------
// 設定／修改到期時間
// -----------------------------------------------------------------------------

export const updateInviteExpiry = onCall<{
  gid?: unknown;
  inviteId?: unknown;
  expiresAt?: unknown;
}>(CALLABLE, async (req) => {
  const uid = requireAuth(req);
  const gid = requireString(req.data?.gid, 'gid');
  const inviteId = requireString(req.data?.inviteId, 'inviteId');
  const now = Date.now();

  await requireManager(gid, uid);
  await limit(`updateInviteExpiry:${uid}`, MANAGE_RATE_LIMIT, now);

  const expiresAt = parseExpiresAt(req.data?.expiresAt, now);
  const ref = db.doc(`groups/${gid}/invites/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', '邀請不存在');
  }
  const state = inviteState(snap.data() as DocumentData);
  if (state.deletedAt !== null || state.revokedAt !== null) {
    throw new HttpsError('failed-precondition', '這張邀請已經失效，請重新產生');
  }

  await ref.update({
    expiresAt: expiresAt === null ? null : Timestamp.fromMillis(expiresAt),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { inviteId, expiresAt };
});

// -----------------------------------------------------------------------------
// 列出邀請（只回中繼資料，永遠不回 token）
// -----------------------------------------------------------------------------

export const listInvites = onCall<{ gid?: unknown }>(CALLABLE, async (req) => {
  const uid = requireAuth(req);
  const gid = requireString(req.data?.gid, 'gid');
  const now = Date.now();

  await requireManager(gid, uid);

  const snaps = await db
    .collection(`groups/${gid}/invites`)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return {
    invites: snaps.docs.map((snap) => {
      const data = snap.data();
      const state = inviteState(data);
      return {
        inviteId: snap.id,
        createdAt: toMillis(data.createdAt),
        createdBy: data.createdBy ?? null,
        expiresAt: state.expiresAt,
        revokedAt: state.revokedAt,
        rejection: inviteRejection(state, now),
      };
    }),
  };
});

// -----------------------------------------------------------------------------
// 用邀請連結加入
// -----------------------------------------------------------------------------

export const joinByInvite = onCall<{ token?: unknown }>(CALLABLE, async (req) => {
  const uid = requireAuth(req);
  const now = Date.now();

  // 先擋格式，再限速，最後才查 Firestore。
  if (!looksLikeToken(req.data?.token)) {
    throw new HttpsError('invalid-argument', '邀請連結格式不正確');
  }
  await limit(`joinByInvite:${uid}`, JOIN_RATE_LIMIT, now);

  const token = req.data.token as string;
  const tokenHash = hashToken(token);

  // tokenHash 全域唯一，但還是用 collection group 查再逐筆定時比對。
  const snaps = await db
    .collectionGroup('invites')
    .where('tokenHash', '==', tokenHash)
    .limit(5)
    .get();

  const match = snaps.docs.find(
    (snap) =>
      hashEquals(String(snap.data().tokenHash ?? ''), tokenHash) &&
      inviteRejection(inviteState(snap.data()), now) === null,
  );

  if (!match) {
    logger.info('joinByInvite 失敗', { uid, found: snaps.size });
    throw new HttpsError('not-found', '邀請連結無效或已失效');
  }

  const gid = match.ref.parent.parent?.id;
  if (!gid) {
    throw new HttpsError('internal', '邀請資料結構異常');
  }

  const groupRef = db.doc(`groups/${gid}`);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(groupRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', '群組不存在');
    }
    const data = snap.data() as DocumentData;
    if (data.deletedAt != null) {
      throw new HttpsError('not-found', '群組已刪除');
    }

    const roles = (data.roles ?? {}) as Record<string, string>;
    if (roles[uid]) {
      return { gid, groupName: data.name as string, role: roles[uid], alreadyMember: true };
    }

    tx.update(groupRef, {
      [`roles.${uid}`]: 'viewer',
      memberUids: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { gid, groupName: data.name as string, role: 'viewer', alreadyMember: false };
  });

  return result;
});

// -----------------------------------------------------------------------------
// 讓前端在未登入時也能先確認連結有沒有過期
// -----------------------------------------------------------------------------

export const peekInvite = onCall<{ token?: unknown }>(CALLABLE, async (req) => {
  const now = Date.now();
  if (!looksLikeToken(req.data?.token)) {
    throw new HttpsError('invalid-argument', '邀請連結格式不正確');
  }

  // 未登入也能呼叫，所以用 App Check 的 app id 當限速 bucket。
  await limit(`peekInvite:${req.app?.appId ?? 'anonymous'}`, JOIN_RATE_LIMIT, now);

  const tokenHash = hashToken(req.data.token as string);
  const snaps = await db
    .collectionGroup('invites')
    .where('tokenHash', '==', tokenHash)
    .limit(5)
    .get();

  const match = snaps.docs.find((snap) => hashEquals(String(snap.data().tokenHash ?? ''), tokenHash));
  if (!match) {
    return { valid: false, reason: 'not-found' as const, groupName: null };
  }

  const rejection = inviteRejection(inviteState(match.data()), now);
  if (rejection) {
    return { valid: false, reason: rejection, groupName: null };
  }

  const gid = match.ref.parent.parent?.id;
  const group = gid ? await loadGroupName(gid) : null;
  return { valid: group !== null, reason: null, groupName: group };
});

async function loadGroupName(gid: string): Promise<string | null> {
  const snap = await db.doc(`groups/${gid}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as DocumentData;
  if (data.deletedAt != null) return null;
  return (data.name as string) ?? null;
}
