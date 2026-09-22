/**
 * 權限表第 3.2 節：群組、邀請、成員三個區塊。
 *
 * 每個 describe 對應權限表的一列，裡面的每個 it 對應那一列的一格。
 */

import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import {
  ACTOR_UID,
  ADMIN,
  ADMIN2,
  ALL_DENY,
  type Cell,
  DELETED_GID,
  GID,
  MEMBER_READ,
  MANAGER_ONLY,
  OUTSIDER,
  OWNER,
  OWNER_ONLY,
  P,
  VIEWER,
  VIEWER2,
  anonDb,
  createTestEnv,
  dbOf,
  groupData,
  memberData,
  reseed,
  table,
} from './helpers';

/** 「我修的科目」測試要寫進去的科目 id。 */
const SUBJECT_PICK = 'sub_picked';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await reseed(env);
});

async function run(cell: Cell, op: (db: Firestore) => Promise<unknown>): Promise<void> {
  const db = dbOf(env, cell.actor);
  if (cell.allowed) await assertSucceeds(op(db));
  else await assertFails(op(db));
}

// =============================================================================
// 群組
// =============================================================================

describe('群組｜建立群組（建立者成為擁有者）', () => {
  // 權限表：擁有者／管理者／檢視者皆為「—　不適用」，只有非成員這一格是 ✓。
  it('非成員 — 應被允許', async () => {
    const db = dbOf(env, '非成員');
    await assertSucceeds(
      setDoc(
        doc(db, P.group('g_new')),
        groupData({ ownerUid: OUTSIDER, roles: { [OUTSIDER]: 'owner' }, memberUids: [OUTSIDER] }),
      ),
    );
  });

  it('未登入 — 應被拒絕', async () => {
    const db = anonDb(env);
    await assertFails(
      setDoc(
        doc(db, P.group('g_new')),
        groupData({ ownerUid: OUTSIDER, roles: { [OUTSIDER]: 'owner' }, memberUids: [OUTSIDER] }),
      ),
    );
  });

  it('把 ownerUid 指給別人 — 應被拒絕', async () => {
    const db = dbOf(env, '非成員');
    await assertFails(
      setDoc(
        doc(db, P.group('g_new')),
        groupData({ ownerUid: OWNER, roles: { [OWNER]: 'owner', [OUTSIDER]: 'admin' } }),
      ),
    );
  });

  it('沒把自己設成 owner — 應被拒絕', async () => {
    const db = dbOf(env, '非成員');
    await assertFails(
      setDoc(
        doc(db, P.group('g_new')),
        groupData({ ownerUid: OUTSIDER, roles: { [OUTSIDER]: 'viewer' } }),
      ),
    );
  });

  it('roles 裡有兩個 owner — 應被拒絕', async () => {
    const db = dbOf(env, '非成員');
    await assertFails(
      setDoc(
        doc(db, P.group('g_new')),
        groupData({ ownerUid: OUTSIDER, roles: { [OUTSIDER]: 'owner', [VIEWER]: 'owner' } }),
      ),
    );
  });

  it('roles 帶了不合法的角色值 — 應被拒絕', async () => {
    const db = dbOf(env, '非成員');
    await assertFails(
      setDoc(
        doc(db, P.group('g_new')),
        groupData({ ownerUid: OUTSIDER, roles: { [OUTSIDER]: 'owner', [VIEWER]: 'superuser' } }),
      ),
    );
  });

  it('建立時就帶 deletedAt — 應被拒絕', async () => {
    const db = dbOf(env, '非成員');
    await assertFails(
      setDoc(
        doc(db, P.group('g_new')),
        groupData({
          ownerUid: OUTSIDER,
          roles: { [OUTSIDER]: 'owner' },
          deletedAt: serverTimestamp(),
        }),
      ),
    );
  });
});

describe('群組｜讀取群組資料', () => {
  it.each(table(MEMBER_READ))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => getDoc(doc(db, P.group())));
  });

  it('未登入 — 應被拒絕', async () => {
    await assertFails(getDoc(doc(anonDb(env), P.group())));
  });

  it('已軟刪除的群組 — 連擁有者也應被拒絕', async () => {
    await assertFails(getDoc(doc(dbOf(env, '擁有者'), P.group(DELETED_GID))));
  });
});

describe('群組｜修改群組名稱', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.group()), { name: '資工一乙' }));
  });

  it('改名時順手動 roles — 管理者應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '管理者'), P.group()), {
        name: '資工一乙',
        [`roles.${VIEWER}`]: 'admin',
      }),
    );
  });
});

describe('群組｜軟刪除群組', () => {
  it.each(table(OWNER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.group()), { deletedAt: serverTimestamp() }));
  });

  it('deletedAt 寫成任意時間而非 request.time — 擁有者也應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '擁有者'), P.group()), { deletedAt: 1_600_000_000_000 }),
    );
  });
});

describe('群組｜指派管理者', () => {
  it.each(table(OWNER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.group()), { [`roles.${VIEWER2}`]: 'admin' }));
  });

  it('擁有者把別人升成 owner（會有兩個擁有者）— 應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '擁有者'), P.group()), { [`roles.${VIEWER2}`]: 'owner' }),
    );
  });

  it('擁有者把不在群組裡的人直接加進 roles — 應被拒絕（加入一律走邀請連結）', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '擁有者'), P.group()), { [`roles.${OUTSIDER}`]: 'viewer' }),
    );
  });
});

describe('群組｜移除管理者（降回檢視者）', () => {
  it.each(table(OWNER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.group()), { [`roles.${ADMIN2}`]: 'viewer' }));
  });
});

describe('群組｜轉移擁有者', () => {
  it.each(table(OWNER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) =>
      updateDoc(doc(db, P.group()), {
        ownerUid: ADMIN2,
        [`roles.${OWNER}`]: 'admin',
        [`roles.${ADMIN2}`]: 'owner',
      }),
    );
  });

  it('轉給不是成員的人 — 應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '擁有者'), P.group()), {
        ownerUid: OUTSIDER,
        [`roles.${OWNER}`]: 'admin',
        [`roles.${OUTSIDER}`]: 'owner',
      }),
    );
  });

  it('只改 ownerUid 沒同時改 roles — 應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '擁有者'), P.group()), { ownerUid: ADMIN2 }),
    );
  });

  it('只改 roles 沒同時改 ownerUid — 應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '擁有者'), P.group()), {
        [`roles.${OWNER}`]: 'admin',
        [`roles.${ADMIN2}`]: 'owner',
      }),
    );
  });

  it('轉移後新擁有者能再指派管理者，舊擁有者不能', async () => {
    await assertSucceeds(
      updateDoc(doc(dbOf(env, '擁有者'), P.group()), {
        ownerUid: ADMIN2,
        [`roles.${OWNER}`]: 'admin',
        [`roles.${ADMIN2}`]: 'owner',
      }),
    );
    const newOwner = env.authenticatedContext(ADMIN2).firestore();
    await assertSucceeds(updateDoc(doc(newOwner, P.group()), { [`roles.${VIEWER2}`]: 'admin' }));
    await assertFails(
      updateDoc(doc(dbOf(env, '擁有者'), P.group()), { [`roles.${VIEWER}`]: 'admin' }),
    );
  });
});

describe('群組｜移除檢視者', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) =>
      updateDoc(doc(db, P.group()), { [`roles.${VIEWER2}`]: deleteField() }),
    );
  });

  it('管理者一次移除兩個檢視者 — 應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '管理者'), P.group()), {
        [`roles.${VIEWER}`]: deleteField(),
        [`roles.${VIEWER2}`]: deleteField(),
      }),
    );
  });

  it('管理者藉著移除檢視者順手改別人的角色 — 應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '管理者'), P.group()), {
        [`roles.${VIEWER2}`]: deleteField(),
        [`roles.${VIEWER}`]: 'admin',
      }),
    );
  });
});

describe('群組｜移除管理者（踢出群組）', () => {
  it.each(table(OWNER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.group()), { [`roles.${ADMIN2}`]: deleteField() }));
  });

  it('管理者移除擁有者 — 應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '管理者'), P.group()), { [`roles.${OWNER}`]: deleteField() }),
    );
  });
});

describe('群組｜自行退出群組', () => {
  // 非成員這一格是「—　不適用」。
  it.each(table({ 擁有者: false, 管理者: true, 檢視者: true, 非成員: null }))(
    '$actor — 應被$label',
    async (cell) => {
      const uid = ACTOR_UID[cell.actor];
      await run(cell, (db) =>
        updateDoc(doc(db, P.group()), { [`roles.${uid}`]: deleteField() }),
      );
    },
  );

  it('擁有者轉移擁有權之後就能退出', async () => {
    const ownerDb = dbOf(env, '擁有者');
    await assertSucceeds(
      updateDoc(doc(ownerDb, P.group()), {
        ownerUid: ADMIN2,
        [`roles.${OWNER}`]: 'admin',
        [`roles.${ADMIN2}`]: 'owner',
      }),
    );
    await assertSucceeds(
      updateDoc(doc(ownerDb, P.group()), { [`roles.${OWNER}`]: deleteField() }),
    );
  });

  it('退出時順手把別人也移除 — 應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '管理者'), P.group()), {
        [`roles.${ADMIN}`]: deleteField(),
        [`roles.${VIEWER2}`]: deleteField(),
      }),
    );
  });
});

describe('群組｜硬刪除群組文件', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => deleteDoc(doc(db, P.group())));
  });
});

describe('群組｜復原（deletedAt 改回 null）', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), P.group()), { deletedAt: new Date() });
    });
  });

  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.group()), { deletedAt: null }));
  });
});

// =============================================================================
// 邀請
//
// 規則層只能表達「直接讀寫 invites 文件」這一列：四欄全 ✗。
// 權限表裡「建立邀請連結／重新產生 token／設定到期時間」對擁有者與管理者
// 標 ✓，那是透過 Cloud Function 以 Admin SDK 完成的（見 3.3 節），
// 規則層一律拒絕直接寫入，其允許與否由步驟 4 的 Function 測試覆蓋。
// =============================================================================

describe('邀請｜直接讀取 invites 文件', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => getDoc(doc(db, P.invite())));
  });
});

describe('邀請｜直接列出 invites 子集合', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => getDocs(collection(db, P.invites())));
  });
});

describe('邀請｜直接建立 invites 文件（＝建立邀請連結的前端路徑）', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) =>
      setDoc(doc(db, P.invite('inv_new')), {
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
        tokenHash: 'y'.repeat(64),
        role: 'viewer',
        expiresAt: null,
        revokedAt: null,
        createdBy: ACTOR_UID[cell.actor],
      }),
    );
  });
});

describe('邀請｜直接改寫 tokenHash（＝重新產生 token 的前端路徑）', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.invite()), { tokenHash: 'z'.repeat(64) }));
  });
});

describe('邀請｜直接改寫 expiresAt（＝設定到期時間的前端路徑）', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.invite()), { expiresAt: 1_800_000_000_000 }));
  });
});

describe('邀請｜硬刪除 invites 文件', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => deleteDoc(doc(db, P.invite())));
  });
});

describe('邀請｜用邀請連結加入', () => {
  // 權限表這一列只有非成員有 ✓，而且一定要走 Cloud Function。
  it('非成員自己把自己寫進 roles — 應被拒絕（加入只能走 Cloud Function）', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '非成員'), P.group()), { [`roles.${OUTSIDER}`]: 'viewer' }),
    );
  });

  it('非成員建立自己的 members 文件 — 應被拒絕', async () => {
    await assertFails(
      setDoc(doc(dbOf(env, '非成員'), P.member(OUTSIDER)), memberData(OUTSIDER)),
    );
  });
});

// =============================================================================
// 成員
// =============================================================================

describe('成員｜讀取成員清單與角色', () => {
  it.each(table(MEMBER_READ))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) =>
      getDocs(query(collection(db, P.members()), where('deletedAt', '==', null))),
    );
  });

  it('未登入 — 應被拒絕', async () => {
    await assertFails(
      getDocs(query(collection(anonDb(env), P.members()), where('deletedAt', '==', null))),
    );
  });

  it('沒帶 deletedAt == null 的查詢 — 成員也應被拒絕', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), P.member(VIEWER2)), { deletedAt: new Date() });
    });
    await assertFails(getDocs(collection(dbOf(env, '檢視者'), P.members())));
  });
});

describe('成員｜修改自己的「我修的科目」', () => {
  it.each(table(MEMBER_READ))('$actor — 應被$label', async (cell) => {
    const uid = ACTOR_UID[cell.actor];
    await run(cell, (db) =>
      updateDoc(doc(db, P.member(uid)), { enrolledSubjectIds: [SUBJECT_PICK] }),
    );
  });
});

describe('成員｜修改別人的「我修的科目」', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) =>
      updateDoc(doc(db, P.member(VIEWER2)), { enrolledSubjectIds: [SUBJECT_PICK] }),
    );
  });
});

describe('成員｜硬刪除成員文件', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => deleteDoc(doc(db, P.member(ACTOR_UID[cell.actor]))));
  });
});

// =============================================================================
// userGroups：多群組切換索引，由 Cloud Functions 維護
// =============================================================================

describe('userGroups｜多群組切換索引', () => {
  it('本人可以讀自己的', async () => {
    await assertSucceeds(getDoc(doc(dbOf(env, '擁有者'), P.userGroup(OWNER))));
  });

  it('別人不能讀', async () => {
    await assertFails(getDoc(doc(dbOf(env, '管理者'), P.userGroup(OWNER))));
  });

  it('本人也不能寫（只由 Cloud Functions 維護）', async () => {
    await assertFails(
      setDoc(doc(dbOf(env, '擁有者'), P.userGroup(OWNER)), {
        gid: GID,
        groupName: '偽造',
        role: 'owner',
        joinedAt: 0,
      }),
    );
  });
});
