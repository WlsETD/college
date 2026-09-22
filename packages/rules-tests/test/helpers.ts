/**
 * 安全規則測試的共用設定。
 *
 * 對應 docs/01_spec_section3.md 第 3.2 節的權限表：
 * 表格有四欄（擁有者／管理者／檢視者／非成員），每一列動作 × 每一欄角色
 * 就是一「格」。每一格都要有一個測試案例——標 ✓ 寫允許、標 ✗ 寫拒絕。
 *
 * 這裡把「欄」做成 Actor，測試檔用 table() 把一列的四格展開成四個測試。
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, doc, writeBatch, type Firestore } from 'firebase/firestore';
import { ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';

const here = dirname(fileURLToPath(import.meta.url));
/** packages/rules-tests/test → 專案根目錄 */
export const REPO_ROOT = resolve(here, '../../..');

export const PROJECT_ID = 'demo-jindu';

// -----------------------------------------------------------------------------
// 使用者
// -----------------------------------------------------------------------------

export const OWNER = 'u_owner';
export const ADMIN = 'u_admin';
/** 第二位管理者，用來測「移除管理者」與「管理者不能動管理者」。 */
export const ADMIN2 = 'u_admin2';
export const VIEWER = 'u_viewer';
/** 第二位檢視者，用來測「移除檢視者」。 */
export const VIEWER2 = 'u_viewer2';
/** 已登入但不屬於這個群組的人。 */
export const OUTSIDER = 'u_outsider';

/** 權限表的四個欄位。 */
export const ACTORS = ['擁有者', '管理者', '檢視者', '非成員'] as const;
export type Actor = (typeof ACTORS)[number];

export const ACTOR_UID: Record<Actor, string> = {
  擁有者: OWNER,
  管理者: ADMIN,
  檢視者: VIEWER,
  非成員: OUTSIDER,
};

/** 權限表的一格。null 代表「—　不適用」，不產生測試。 */
export type Cell = { actor: Actor; allowed: boolean; label: '允許' | '拒絕' };

export function table(row: Partial<Record<Actor, boolean | null>>): Cell[] {
  return ACTORS.filter((a) => row[a] === true || row[a] === false).map((a) => ({
    actor: a,
    allowed: row[a] as boolean,
    label: row[a] ? ('允許' as const) : ('拒絕' as const),
  }));
}

/** 四欄都允許 */
export const ALL_ALLOW = { 擁有者: true, 管理者: true, 檢視者: true, 非成員: true };
/** 成員可以、非成員不行 */
export const MEMBER_ONLY = { 擁有者: true, 管理者: true, 檢視者: false, 非成員: false };
/** 讀取：成員都可以 */
export const MEMBER_READ = { 擁有者: true, 管理者: true, 檢視者: true, 非成員: false };
/** 管理者權限 */
export const MANAGER_ONLY = MEMBER_ONLY;
/** 只有擁有者 */
export const OWNER_ONLY = { 擁有者: true, 管理者: false, 檢視者: false, 非成員: false };
/** 四欄都拒絕 */
export const ALL_DENY = { 擁有者: false, 管理者: false, 檢視者: false, 非成員: false };

// -----------------------------------------------------------------------------
// 文件 id 與路徑
// -----------------------------------------------------------------------------

export const GID = 'g1';
/** 另一個群組，OUTSIDER 是那裡的擁有者。用來測跨群組隔離。 */
export const OTHER_GID = 'g2';
/** 已軟刪除的群組。 */
export const DELETED_GID = 'g_deleted';

export const SEM = 'sem1';
export const SEM_DEL = 'sem1_deleted';
export const SUB = 'sub1';
export const SUB_DEL = 'sub1_deleted';
export const CHAP = 'chap1';
export const CHAP_DEL = 'chap1_deleted';
export const ITEM = 'item1';
export const ITEM_DEL = 'item1_deleted';
export const INVITE = 'inv1';

export const P = {
  group: (gid = GID) => `groups/${gid}`,
  invites: (gid = GID) => `groups/${gid}/invites`,
  invite: (id = INVITE, gid = GID) => `groups/${gid}/invites/${id}`,
  members: (gid = GID) => `groups/${gid}/members`,
  member: (uid: string, gid = GID) => `groups/${gid}/members/${uid}`,
  semesters: (gid = GID) => `groups/${gid}/semesters`,
  semester: (id = SEM, gid = GID) => `groups/${gid}/semesters/${id}`,
  subjects: (sem = SEM, gid = GID) => `groups/${gid}/semesters/${sem}/subjects`,
  subject: (id = SUB, sem = SEM, gid = GID) =>
    `groups/${gid}/semesters/${sem}/subjects/${id}`,
  chapters: (sub = SUB, sem = SEM, gid = GID) =>
    `groups/${gid}/semesters/${sem}/subjects/${sub}/chapters`,
  chapter: (id = CHAP, sub = SUB, sem = SEM, gid = GID) =>
    `groups/${gid}/semesters/${sem}/subjects/${sub}/chapters/${id}`,
  items: (sub = SUB, sem = SEM, gid = GID) =>
    `groups/${gid}/semesters/${sem}/subjects/${sub}/items`,
  item: (id = ITEM, sub = SUB, sem = SEM, gid = GID) =>
    `groups/${gid}/semesters/${sem}/subjects/${sub}/items/${id}`,
  userGroup: (uid: string, gid = GID) => `userGroups/${uid}/groups/${gid}`,
};

/** Storage 的路徑慣例：groups/{gid}/... */
export const S = {
  file: (name: string, gid = GID) => `groups/${gid}/${SEM}/${SUB}/${name}`,
  outside: (name: string) => `scratch/${name}`,
};

export const EXISTING_OBJECT = 'existing.png';

// -----------------------------------------------------------------------------
// 測試環境
// -----------------------------------------------------------------------------

export async function createTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(REPO_ROOT, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync(resolve(REPO_ROOT, 'storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
}

// @firebase/rules-unit-testing 的 context.firestore() / storage() 回傳的是
// compat 型別的實例。modular API（doc / setDoc / uploadBytes…）在執行期會用
// getModularInstance() 解開 _delegate，所以實際上完全可用，只是型別對不上，
// 官方文件的範例也是這樣混用。這裡集中做一次轉型，測試檔就不必再處理。
type Ctx = ReturnType<RulesTestEnvironment['authenticatedContext']>;

function fs(ctx: Ctx): Firestore {
  return ctx.firestore() as unknown as Firestore;
}

function st(ctx: Ctx): FirebaseStorage {
  return ctx.storage() as unknown as FirebaseStorage;
}

export function dbOf(env: RulesTestEnvironment, actor: Actor): Firestore {
  return fs(env.authenticatedContext(ACTOR_UID[actor]));
}

export function dbOfUid(env: RulesTestEnvironment, uid: string): Firestore {
  return fs(env.authenticatedContext(uid));
}

export function anonDb(env: RulesTestEnvironment): Firestore {
  return fs(env.unauthenticatedContext() as unknown as Ctx);
}

export function storageOf(env: RulesTestEnvironment, actor: Actor): FirebaseStorage {
  return st(env.authenticatedContext(ACTOR_UID[actor]));
}

export function anonStorage(env: RulesTestEnvironment): FirebaseStorage {
  return st(env.unauthenticatedContext() as unknown as Ctx);
}

// -----------------------------------------------------------------------------
// 種子資料
// -----------------------------------------------------------------------------

const T0 = 1_700_000_000_000;
const DELETED_AT = Timestamp.fromMillis(T0);

const base = { createdAt: T0, updatedAt: T0, deletedAt: null as unknown };
const baseDeleted = { createdAt: T0, updatedAt: T0, deletedAt: DELETED_AT };

export const SEEDED_ROLES: Record<string, string> = {
  [OWNER]: 'owner',
  [ADMIN]: 'admin',
  [ADMIN2]: 'admin',
  [VIEWER]: 'viewer',
  [VIEWER2]: 'viewer',
};

export function groupData(overrides: Record<string, unknown> = {}) {
  return {
    ...base,
    name: '資工一甲',
    ownerUid: OWNER,
    roles: { ...SEEDED_ROLES },
    memberUids: [OWNER, ADMIN, ADMIN2, VIEWER, VIEWER2],
    activeSemesterId: SEM,
    ...overrides,
  };
}

export function itemData(overrides: Record<string, unknown> = {}) {
  return {
    ...base,
    type: 'homework',
    title: '第一次作業',
    body: '',
    dueAt: T0,
    chapterId: CHAP,
    createdBy: ADMIN,
    gid: GID,
    semId: SEM,
    subId: SUB,
    ...overrides,
  };
}

export function subjectData(overrides: Record<string, unknown> = {}) {
  return {
    ...base,
    name: '微積分',
    shortName: '微積',
    colorIndex: 0,
    schedule: [],
    currentChapterId: null,
    order: 100,
    ...overrides,
  };
}

export function chapterData(overrides: Record<string, unknown> = {}) {
  return {
    ...base,
    title: '極限',
    number: '1',
    parentId: null,
    depth: 0,
    order: 100,
    ...overrides,
  };
}

export function semesterData(overrides: Record<string, unknown> = {}) {
  return {
    ...base,
    name: '115-1',
    startDate: '2026-09-14',
    endDate: '2027-01-17',
    ...overrides,
  };
}

export function memberData(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    ...base,
    uid,
    displayName: uid,
    photoURL: null,
    joinedAt: T0,
    enrolledSubjectIds: [SUB],
    ...overrides,
  };
}

/** 把整個資料庫清空後重新寫入固定的種子資料（繞過安全規則）。 */
export async function reseed(env: RulesTestEnvironment): Promise<void> {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    const b = writeBatch(db);

    b.set(doc(db, P.group()), groupData());
    b.set(doc(db, P.group(DELETED_GID)), groupData({ ...baseDeleted }));
    b.set(
      doc(db, P.group(OTHER_GID)),
      groupData({
        name: '外系班群',
        ownerUid: OUTSIDER,
        roles: { [OUTSIDER]: 'owner' },
        memberUids: [OUTSIDER],
      }),
    );

    b.set(doc(db, P.invite()), {
      ...base,
      tokenHash: 'x'.repeat(64),
      role: 'viewer',
      expiresAt: null,
      revokedAt: null,
      createdBy: OWNER,
    });

    for (const uid of [OWNER, ADMIN, ADMIN2, VIEWER, VIEWER2]) {
      b.set(doc(db, P.member(uid)), memberData(uid));
    }

    b.set(doc(db, P.semester()), semesterData());
    b.set(doc(db, P.semester(SEM_DEL)), semesterData({ ...baseDeleted }));
    b.set(doc(db, P.subject()), subjectData());
    b.set(doc(db, P.subject(SUB_DEL)), subjectData({ ...baseDeleted }));
    b.set(doc(db, P.chapter()), chapterData());
    b.set(doc(db, P.chapter(CHAP_DEL)), chapterData({ ...baseDeleted }));
    b.set(doc(db, P.item()), itemData());
    b.set(doc(db, P.item(ITEM_DEL)), itemData({ ...baseDeleted }));

    // 另一個群組的內容項目，用來確認 collection group 查詢不會跨群組讀到。
    b.set(doc(db, P.semester(SEM, OTHER_GID)), semesterData());
    b.set(doc(db, P.subject(SUB, SEM, OTHER_GID)), subjectData());
    b.set(
      doc(db, P.item(ITEM, SUB, SEM, OTHER_GID)),
      itemData({ gid: OTHER_GID, createdBy: OUTSIDER }),
    );

    b.set(doc(db, P.userGroup(OWNER)), {
      gid: GID,
      groupName: '資工一甲',
      role: 'owner',
      joinedAt: T0,
    });

    await b.commit();
  });
}

/** 放一個既有的 Storage 物件進去（繞過安全規則），供下載與刪除測試使用。 */
export async function reseedStorage(env: RulesTestEnvironment): Promise<void> {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const storage = ctx.storage() as unknown as FirebaseStorage;
    await uploadBytes(ref(storage, S.file(EXISTING_OBJECT)), new Uint8Array([1, 2, 3]), {
      contentType: 'image/png',
    });
    await uploadBytes(ref(storage, S.outside(EXISTING_OBJECT)), new Uint8Array([1, 2, 3]), {
      contentType: 'image/png',
    });
  });
}

export const MB = 1024 * 1024;

export function bytes(size: number): Uint8Array {
  return new Uint8Array(size);
}
