/**
 * 權限表第 3.2 節（2026-09-23 新增）：個人課表 users/{uid}/timetables/{termKey}。
 *
 * 跟 groups/{gid} 的角色完全無關，只有一條規則：本人可讀寫，其他任何人
 * （含同群組的管理者、擁有者）一律拒絕。這裡不套用 table()，因為權限表裡
 * 「擁有者／管理者／檢視者／非成員」四欄講的是群組角色，跟課表的本人／
 * 非本人判斷是兩件事。
 */

import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import {
  ADMIN,
  OWNER,
  P,
  anonDb,
  createTestEnv,
  dbOf,
  dbOfUid,
  reseed,
  timetableData,
} from './helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await reseed(env);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), P.timetable()), timetableData());
  });
});

describe('課表｜本人可讀寫，其他任何人一律拒絕', () => {
  it('本人讀取 — 應被允許', async () => {
    await assertSucceeds(getDoc(doc(dbOfUid(env, OWNER), P.timetable())));
  });

  it('本人新增 termKey — 應被允許', async () => {
    await assertSucceeds(
      setDoc(doc(dbOfUid(env, OWNER), P.timetable('115-2')), timetableData({ termKey: '115-2' })),
    );
  });

  it('本人編輯 — 應被允許', async () => {
    await assertSucceeds(
      updateDoc(doc(dbOfUid(env, OWNER), P.timetable()), { entries: [] }),
    );
  });

  it('同群組的管理者讀取別人的課表 — 應被拒絕', async () => {
    await assertFails(getDoc(doc(dbOf(env, '管理者'), P.timetable())));
  });

  it('同群組的擁有者以外的人寫入 — 應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOfUid(env, ADMIN), P.timetable()), { entries: [] }),
    );
  });

  it('非成員讀取 — 應被拒絕', async () => {
    await assertFails(getDoc(doc(dbOf(env, '非成員'), P.timetable())));
  });

  it('未登入 — 應被拒絕', async () => {
    await assertFails(getDoc(doc(anonDb(env), P.timetable())));
  });

  it('本人硬刪除 — 應被拒絕（跟其餘集合一樣只能軟刪除）', async () => {
    await assertFails(deleteDoc(doc(dbOfUid(env, OWNER), P.timetable())));
  });
});
