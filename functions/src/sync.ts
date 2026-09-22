/**
 * 群組文件變動時，同步兩件前端寫不到的東西：
 *
 *   1. userGroups/{uid}/groups/{gid}——多群組切換的索引。
 *      安全規則對它是 `allow write: if false`，只能由 Admin SDK 維護。
 *   2. 被移出 roles 的成員，他的 groups/{gid}/members/{uid} 要軟刪除。
 *      規則只讓本人寫自己那一筆，所以退出或被踢時沒人能清掉它。
 *
 * 索引以「看得見的成員」為準：群組被軟刪除時等同於沒有任何成員，
 * 索引全部移除；復原時再依 roles 重建。
 */

import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

import { db } from './firebase';
import { documentTrigger } from './options';
import { diffRoles, planIsEmpty, type RoleMap } from './lib/roles';

/** 群組看不見（不存在或已軟刪除）時，對索引而言等於沒有成員。 */
function visibleRoles(data: DocumentData | undefined): RoleMap {
  if (!data) return {};
  if (data.deletedAt != null) return {};
  return (data.roles ?? {}) as RoleMap;
}

function rawRoles(data: DocumentData | undefined): RoleMap {
  return (data?.roles ?? {}) as RoleMap;
}

function nameOf(data: DocumentData | undefined): string | null {
  return typeof data?.name === 'string' ? data.name : null;
}

export const onGroupWritten = onDocumentWritten(documentTrigger('groups/{gid}'), async (event) => {
  const gid = event.params.gid;
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  // 索引用「看得見的成員」比對；members 文件用原始 roles 比對，
  // 免得群組被軟刪除時把所有人的 members 文件都當成「被移除」。
  const indexPlan = diffRoles(
    visibleRoles(before),
    visibleRoles(after),
    nameOf(before),
    nameOf(after),
  );
  const memberPlan = diffRoles(rawRoles(before), rawRoles(after), null, null);

  // 群組文件整個不見時（只有 Admin SDK 做得到，規則禁止硬刪除）不動 members，
  // 否則會把已經被刪掉的 members 文件用 merge 寫回來，變成幽靈資料。
  const memberRemovals = after ? memberPlan.removed : [];

  if (planIsEmpty(indexPlan) && memberRemovals.length === 0) return;

  const groupName = nameOf(after) ?? nameOf(before) ?? '';
  const batch = db.batch();

  for (const { uid, role } of indexPlan.added) {
    batch.set(db.doc(`userGroups/${uid}/groups/${gid}`), {
      gid,
      groupName,
      role,
      joinedAt: FieldValue.serverTimestamp(),
    });
  }

  for (const { uid, role } of indexPlan.changed) {
    batch.set(db.doc(`userGroups/${uid}/groups/${gid}`), { gid, groupName, role }, { merge: true });
  }

  for (const uid of indexPlan.removed) {
    batch.delete(db.doc(`userGroups/${uid}/groups/${gid}`));
  }

  if (indexPlan.renamed) {
    // 改名時沒被 added / changed 涵蓋到的人也要更新 groupName。
    const touched = new Set([
      ...indexPlan.added.map((x) => x.uid),
      ...indexPlan.changed.map((x) => x.uid),
    ]);
    for (const uid of Object.keys(visibleRoles(after))) {
      if (!touched.has(uid)) {
        batch.set(db.doc(`userGroups/${uid}/groups/${gid}`), { groupName }, { merge: true });
      }
    }
  }

  // 真的離開群組的人，把 members 文件軟刪除。只動已經存在而且還沒被刪的那些。
  let softDeleted = 0;
  if (memberRemovals.length > 0) {
    const snaps = await db.getAll(
      ...memberRemovals.map((uid) => db.doc(`groups/${gid}/members/${uid}`)),
    );
    const removedAt = Timestamp.now();
    for (const snap of snaps) {
      if (snap.exists && snap.get('deletedAt') == null) {
        batch.update(snap.ref, { deletedAt: removedAt, updatedAt: FieldValue.serverTimestamp() });
        softDeleted += 1;
      }
    }
  }

  await batch.commit();

  logger.debug('onGroupWritten 同步完成', {
    gid,
    added: indexPlan.added.length,
    changed: indexPlan.changed.length,
    removed: indexPlan.removed.length,
    renamed: indexPlan.renamed,
    membersSoftDeleted: softDeleted,
  });
});
