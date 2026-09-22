/** Callable 共用的參數檢查與權限檢查。 */

import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import { isManager, type Role } from '@jindu/shared';

import { db } from '../firebase';

export function requireAuth(req: CallableRequest<unknown>): string {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', '請先登入');
  }
  return req.auth.uid;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpsError('invalid-argument', `${field} 必須是非空字串`);
  }
  return value;
}

export interface GroupContext {
  gid: string;
  data: DocumentData;
  role: Role | undefined;
}

/** 讀出群組文件，順便確認它還在。 */
export async function loadGroup(gid: string, uid: string): Promise<GroupContext> {
  const snap = await db.doc(`groups/${gid}`).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', '群組不存在');
  }
  const data = snap.data() as DocumentData;
  if (data.deletedAt != null) {
    throw new HttpsError('not-found', '群組已刪除');
  }
  return { gid, data, role: (data.roles ?? {})[uid] as Role | undefined };
}

/** 擁有者或管理者才能過。 */
export async function requireManager(gid: string, uid: string): Promise<GroupContext> {
  const ctx = await loadGroup(gid, uid);
  if (!isManager(ctx.role)) {
    throw new HttpsError('permission-denied', '只有擁有者與管理者可以做這件事');
  }
  return ctx;
}
