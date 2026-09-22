/**
 * 比對群組文件前後的 roles，算出 userGroups 索引與 members 文件要怎麼跟著改。
 *
 * 安全規則不讓前端寫 userGroups（見 firestore.rules），所以這份索引一律由
 * Functions 的 onGroupWritten 觸發器維護。純計算放在這裡方便測。
 */

import type { Role } from '@jindu/shared';

export type RoleMap = Record<string, Role>;

export interface RoleSyncPlan {
  /** 新加入的成員：要建 userGroups 索引，members 文件不存在就補一筆。 */
  added: { uid: string; role: Role }[];
  /** 角色變了：只更新 userGroups 索引裡的 role。 */
  changed: { uid: string; role: Role }[];
  /** 不再是成員：刪掉 userGroups 索引，members 文件軟刪除。 */
  removed: string[];
  /** 群組改名時，所有索引的 groupName 都要跟著更新。 */
  renamed: boolean;
}

export function diffRoles(
  before: RoleMap | null,
  after: RoleMap | null,
  beforeName: string | null,
  afterName: string | null,
): RoleSyncPlan {
  const prev = before ?? {};
  const next = after ?? {};

  const added: RoleSyncPlan['added'] = [];
  const changed: RoleSyncPlan['changed'] = [];
  const removed: string[] = [];

  for (const [uid, role] of Object.entries(next)) {
    const old = prev[uid];
    if (old === undefined) added.push({ uid, role });
    else if (old !== role) changed.push({ uid, role });
  }

  for (const uid of Object.keys(prev)) {
    if (next[uid] === undefined) removed.push(uid);
  }

  return {
    added,
    changed,
    removed,
    renamed: beforeName !== null && afterName !== null && beforeName !== afterName,
  };
}

/** 這次變更有沒有事情要做。沒有就直接結束，省一次寫入。 */
export function planIsEmpty(plan: RoleSyncPlan): boolean {
  return (
    plan.added.length === 0 &&
    plan.changed.length === 0 &&
    plan.removed.length === 0 &&
    !plan.renamed
  );
}
