/**
 * 權限表第 3.2 節：學期、科目、章節、內容項目，以及「通用」兩列
 * （硬刪除、把 deletedAt 改回 null）。
 */

import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  collectionGroup,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import {
  ALL_DENY,
  CHAP,
  CHAP_DEL,
  type Cell,
  CLOSURE_DEL,
  GID,
  ITEM_DEL,
  MANAGER_ONLY,
  MEMBER_READ,
  OTHER_GID,
  P,
  SEM,
  SEM_DEL,
  SUB,
  SUB_DEL,
  anonDb,
  chapterData,
  closureData,
  createTestEnv,
  dbOf,
  itemData,
  reseed,
  semesterData,
  subjectData,
  table,
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
});

async function run(cell: Cell, op: (db: Firestore) => Promise<unknown>): Promise<void> {
  const db = dbOf(env, cell.actor);
  if (cell.allowed) await assertSucceeds(op(db));
  else await assertFails(op(db));
}

// =============================================================================
// 學期
// =============================================================================

describe('學期｜讀取', () => {
  it.each(table(MEMBER_READ))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => getDoc(doc(db, P.semester())));
  });

  it('未登入 — 應被拒絕', async () => {
    await assertFails(getDoc(doc(anonDb(env), P.semester())));
  });

  it('已軟刪除的學期 — 成員也讀不到', async () => {
    await assertFails(getDoc(doc(dbOf(env, '檢視者'), P.semester(SEM_DEL))));
  });

  it('沒帶 deletedAt == null 的 list 查詢 — 成員也應被拒絕', async () => {
    await assertFails(getDocs(collection(dbOf(env, '檢視者'), P.semesters())));
  });

  it('帶了 deletedAt == null 的 list 查詢 — 成員應被允許', async () => {
    await assertSucceeds(
      getDocs(query(collection(dbOf(env, '檢視者'), P.semesters()), where('deletedAt', '==', null))),
    );
  });
});

describe('學期｜建立', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => setDoc(doc(db, P.semester('sem_new')), semesterData()));
  });
});

describe('學期｜改名', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.semester()), { name: '115-2' }));
  });
});

describe('學期｜軟刪除', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.semester()), { deletedAt: serverTimestamp() }));
  });

  it('deletedAt 寫成任意時間而非 request.time — 管理者也應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '管理者'), P.semester()), { deletedAt: 1_600_000_000_000 }),
    );
  });
});

describe('學期｜切換目前學期（groups/{gid}.activeSemesterId）', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.group()), { activeSemesterId: 'sem_other' }));
  });
});

describe('學期｜硬刪除', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => deleteDoc(doc(db, P.semester())));
  });
});

// =============================================================================
// 停課日 closures（2026-09-23 新增）
// =============================================================================

describe('停課日｜讀取', () => {
  it.each(table(MEMBER_READ))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => getDoc(doc(db, P.closure())));
  });

  it('未登入 — 應被拒絕', async () => {
    await assertFails(getDoc(doc(anonDb(env), P.closure())));
  });

  it('已軟刪除的停課日 — 成員也讀不到', async () => {
    await assertFails(getDoc(doc(dbOf(env, '檢視者'), P.closure(CLOSURE_DEL))));
  });

  it('沒帶 deletedAt == null 的 list 查詢 — 成員也應被拒絕', async () => {
    await assertFails(getDocs(collection(dbOf(env, '檢視者'), P.closures())));
  });

  it('帶了 deletedAt == null 的 list 查詢 — 成員應被允許', async () => {
    await assertSucceeds(
      getDocs(query(collection(dbOf(env, '檢視者'), P.closures()), where('deletedAt', '==', null))),
    );
  });
});

describe('停課日｜新增', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => setDoc(doc(db, P.closure('closure_new')), closureData()));
  });
});

describe('停課日｜編輯', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.closure()), { name: '校慶停課' }));
  });
});

describe('停課日｜軟刪除', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.closure()), { deletedAt: serverTimestamp() }));
  });
});

describe('停課日｜硬刪除', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => deleteDoc(doc(db, P.closure())));
  });
});

// =============================================================================
// 科目
// =============================================================================

describe('科目｜讀取', () => {
  it.each(table(MEMBER_READ))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => getDoc(doc(db, P.subject())));
  });

  it('已軟刪除的科目 — 成員也讀不到', async () => {
    await assertFails(getDoc(doc(dbOf(env, '檢視者'), P.subject(SUB_DEL))));
  });
});

describe('科目｜建立', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => setDoc(doc(db, P.subject('sub_new')), subjectData()));
  });
});

describe('科目｜編輯', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.subject()), { name: '線性代數' }));
  });
});

describe('科目｜排序', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.subject()), { order: 300 }));
  });
});

describe('科目｜軟刪除', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.subject()), { deletedAt: serverTimestamp() }));
  });
});

describe('科目｜設定目前進度（currentChapterId）', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.subject()), { currentChapterId: CHAP }));
  });
});

describe('科目｜硬刪除', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => deleteDoc(doc(db, P.subject())));
  });
});

// =============================================================================
// 章節
// =============================================================================

describe('章節｜讀取', () => {
  it.each(table(MEMBER_READ))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => getDoc(doc(db, P.chapter())));
  });

  it('已軟刪除的章節 — 成員也讀不到', async () => {
    await assertFails(getDoc(doc(dbOf(env, '檢視者'), P.chapter(CHAP_DEL))));
  });
});

describe('章節｜新增', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) =>
      setDoc(doc(db, P.chapter('chap_new')), chapterData({ number: '1-1', parentId: CHAP, depth: 1 })),
    );
  });
});

describe('章節｜改名', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.chapter()), { title: '連續' }));
  });
});

describe('章節｜排序', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.chapter()), { order: 200 }));
  });
});

describe('章節｜軟刪除', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.chapter()), { deletedAt: serverTimestamp() }));
  });
});

describe('章節｜硬刪除', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => deleteDoc(doc(db, P.chapter())));
  });
});

// =============================================================================
// 內容項目（作業／關鍵字／檔案／連結）
// =============================================================================

describe('內容項目｜讀取', () => {
  it.each(table(MEMBER_READ))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => getDoc(doc(db, P.item())));
  });

  it('已軟刪除的內容項目 — 成員也讀不到', async () => {
    await assertFails(getDoc(doc(dbOf(env, '檢視者'), P.item(ITEM_DEL))));
  });
});

describe('內容項目｜建立', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => setDoc(doc(db, P.item('item_new')), itemData()));
  });

  it.each(['keyword', 'file', 'link'] as const)('管理者建立 %s 型項目 — 應被允許', async (type) => {
    await assertSucceeds(
      setDoc(doc(dbOf(env, '管理者'), P.item(`item_${type}`)), itemData({ type, dueAt: null })),
    );
  });

  it('gid 與實際路徑不符 — 管理者也應被拒絕', async () => {
    await assertFails(
      setDoc(doc(dbOf(env, '管理者'), P.item('item_bad')), itemData({ gid: OTHER_GID })),
    );
  });

  it('semId／subId 與實際路徑不符 — 管理者也應被拒絕', async () => {
    await assertFails(
      setDoc(doc(dbOf(env, '管理者'), P.item('item_bad')), itemData({ semId: 'sem_x' })),
    );
  });
});

describe('內容項目｜編輯', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.item()), { title: '第二次作業' }));
  });
});

describe('內容項目｜軟刪除', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.item()), { deletedAt: serverTimestamp() }));
  });
});

describe('內容項目｜硬刪除', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => deleteDoc(doc(db, P.item())));
  });
});

describe('內容項目｜collection group 查詢（總覽頁）', () => {
  it.each(table(MEMBER_READ))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) =>
      getDocs(
        query(
          collectionGroup(db, 'items'),
          where('gid', '==', GID),
          where('type', '==', 'homework'),
          where('deletedAt', '==', null),
        ),
      ),
    );
  });

  it('查別的群組的 items — 應被拒絕', async () => {
    await assertFails(
      getDocs(
        query(
          collectionGroup(dbOf(env, '擁有者'), 'items'),
          where('gid', '==', OTHER_GID),
          where('deletedAt', '==', null),
        ),
      ),
    );
  });

  it('沒帶 gid 條件的 collection group 查詢 — 應被拒絕', async () => {
    await assertFails(
      getDocs(
        query(collectionGroup(dbOf(env, '擁有者'), 'items'), where('deletedAt', '==', null)),
      ),
    );
  });
});

// =============================================================================
// 通用：復原（deletedAt 改回 null）
// =============================================================================

describe('通用｜復原學期（deletedAt 改回 null）', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.semester(SEM_DEL)), { deletedAt: null }));
  });
});

describe('通用｜復原科目（deletedAt 改回 null）', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.subject(SUB_DEL)), { deletedAt: null }));
  });
});

describe('通用｜復原章節（deletedAt 改回 null）', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.chapter(CHAP_DEL)), { deletedAt: null }));
  });
});

describe('通用｜復原內容項目（deletedAt 改回 null）', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (db) => updateDoc(doc(db, P.item(ITEM_DEL)), { deletedAt: null }));
  });
});

describe('通用｜軟刪除的文件只能復原，不能順便改內容', () => {
  it('管理者改已軟刪除科目的名稱 — 應被拒絕', async () => {
    await assertFails(
      updateDoc(doc(dbOf(env, '管理者'), P.subject(SUB_DEL)), { name: '偷改' }),
    );
  });

  it('管理者復原時一併改名 — 應被允許', async () => {
    await assertSucceeds(
      updateDoc(doc(dbOf(env, '管理者'), P.subject(SUB_DEL)), { deletedAt: null, name: '微積分' }),
    );
  });
});

describe('通用｜跨群組隔離', () => {
  it('g1 的擁有者讀不到 g2 的科目', async () => {
    await assertFails(getDoc(doc(dbOf(env, '擁有者'), P.subject(SUB, SEM, OTHER_GID))));
  });

  it('g1 的管理者不能在 g2 建立內容項目', async () => {
    await assertFails(
      setDoc(
        doc(dbOf(env, '管理者'), P.item('item_cross', SUB, SEM, OTHER_GID)),
        itemData({ gid: OTHER_GID }),
      ),
    );
  });
});
