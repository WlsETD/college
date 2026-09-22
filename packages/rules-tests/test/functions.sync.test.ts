/**
 * onGroupWritten 觸發器的整合測試（步驟 4）。
 *
 * 這個觸發器維護兩樣前端寫不到的東西：
 *   - userGroups/{uid}/groups/{gid}（多群組切換的索引）
 *   - 被移出 roles 的成員，他的 members 文件要軟刪除
 */

import {
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';

import { waitFor } from './callable';
import { createTestEnv } from './helpers';

/**
 * 每個測試用不同的 gid。觸發器是非同步的，前一個測試的
 * clearFirestore 事件可能晚一點才送到，共用同一個 gid 會互相干擾。
 */
let GID = 'g_sync_0';
let seq = 0;

const OWNER = 'u_sync_owner';
const ADMIN = 'u_sync_admin';
const VIEWER = 'u_sync_viewer';

let env: RulesTestEnvironment;

async function asAdmin<T>(fn: (db: Firestore) => Promise<T>): Promise<T> {
  let out: T;
  await env.withSecurityRulesDisabled(async (ctx) => {
    out = await fn(ctx.firestore() as unknown as Firestore);
  });
  return out!;
}

function groupDoc(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    name: '資工一甲',
    ownerUid: OWNER,
    roles: { [OWNER]: 'owner', [ADMIN]: 'admin', [VIEWER]: 'viewer' },
    memberUids: [OWNER, ADMIN, VIEWER],
    activeSemesterId: null,
    ...overrides,
  };
}

/** 讀 userGroups 索引；不存在回 null，讓 waitFor 繼續輪詢。 */
async function readIndex(uid: string): Promise<Record<string, unknown> | null> {
  return asAdmin(async (db) => {
    const snap = await getDoc(doc(db, `userGroups/${uid}/groups/${GID}`));
    return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  });
}

async function indexGone(uid: string): Promise<true | null> {
  const data = await readIndex(uid);
  return data === null ? true : null;
}

async function seedGroup(): Promise<void> {
  await asAdmin(async (db) => {
    await setDoc(doc(db, `groups/${GID}`), groupDoc());
    for (const uid of [OWNER, ADMIN, VIEWER]) {
      await setDoc(doc(db, `groups/${GID}/members/${uid}`), {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        uid,
        displayName: uid,
        photoURL: null,
        joinedAt: Date.now(),
        enrolledSubjectIds: [],
      });
    }
  });
  await waitFor(() => readIndex(VIEWER), '建立群組後的 userGroups 索引');
}

beforeAll(async () => {
  env = await createTestEnv();
}, 60_000);

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  seq += 1;
  GID = `g_sync_${seq}`;
  await env.clearFirestore();
}, 60_000);

describe('onGroupWritten', () => {
  it('建立群組後，每個成員都拿到 userGroups 索引', async () => {
    await seedGroup();
    const owner = await waitFor(() => readIndex(OWNER), 'owner 的索引');
    expect(owner.gid).toBe(GID);
    expect(owner.role).toBe('owner');
    expect(owner.groupName).toBe('資工一甲');
    expect((await readIndex(ADMIN))?.role).toBe('admin');
    expect((await readIndex(VIEWER))?.role).toBe('viewer');
  }, 60_000);

  it('指派管理者後索引的角色會更新', async () => {
    await seedGroup();
    await asAdmin((db) => updateDoc(doc(db, `groups/${GID}`), { [`roles.${VIEWER}`]: 'admin' }));
    const updated = await waitFor(async () => {
      const data = await readIndex(VIEWER);
      return data?.role === 'admin' ? data : null;
    }, '角色更新');
    expect(updated.role).toBe('admin');
  }, 60_000);

  it('群組改名後所有索引的 groupName 都會跟著改', async () => {
    await seedGroup();
    await asAdmin((db) => updateDoc(doc(db, `groups/${GID}`), { name: '資工一乙' }));
    const renamed = await waitFor(async () => {
      const data = await readIndex(ADMIN);
      return data?.groupName === '資工一乙' ? data : null;
    }, '群組改名');
    expect(renamed.groupName).toBe('資工一乙');
  }, 60_000);

  it('成員被移除後索引消失，members 文件被軟刪除', async () => {
    await seedGroup();
    await asAdmin((db) =>
      updateDoc(doc(db, `groups/${GID}`), { [`roles.${VIEWER}`]: deleteField() }),
    );

    await waitFor(() => indexGone(VIEWER), '索引被刪除');

    const member = await waitFor(async () => {
      const data = await asAdmin(async (db) => {
        const snap = await getDoc(doc(db, `groups/${GID}/members/${VIEWER}`));
        return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      });
      return data?.deletedAt ? data : null;
    }, 'members 文件被軟刪除');
    expect(member.deletedAt).not.toBeNull();

    // 其他人不受影響
    expect(await readIndex(ADMIN)).not.toBeNull();
  }, 60_000);

  it('群組軟刪除後所有索引都消失，復原後重新出現', async () => {
    await seedGroup();

    await asAdmin((db) => updateDoc(doc(db, `groups/${GID}`), { deletedAt: new Date() }));
    await waitFor(() => indexGone(OWNER), '軟刪除後索引消失');
    await waitFor(() => indexGone(VIEWER), '軟刪除後索引消失');

    await asAdmin((db) => updateDoc(doc(db, `groups/${GID}`), { deletedAt: null }));
    const back = await waitFor(() => readIndex(VIEWER), '復原後索引回來');
    expect(back.role).toBe('viewer');
  }, 60_000);

  it('群組軟刪除不會把所有人的 members 文件都當成被移除', async () => {
    await seedGroup();
    await asAdmin((db) => updateDoc(doc(db, `groups/${GID}`), { deletedAt: new Date() }));
    await waitFor(() => indexGone(VIEWER), '軟刪除後索引消失');

    const member = await asAdmin(async (db) => {
      const snap = await getDoc(doc(db, `groups/${GID}/members/${VIEWER}`));
      return snap.data() as Record<string, unknown>;
    });
    expect(member.deletedAt).toBeNull();
  }, 60_000);
});
