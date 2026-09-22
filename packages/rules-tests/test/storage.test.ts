/**
 * 權限表第 3.2 節的 Storage 段落。
 *
 * 3.6 節特別要求：成員身分、管理者身分、30 MB 上限、拒絕 video/* 這四個條件，
 * 每一個都要有自己的拒絕案例，不能只測它們的聯集。
 * 對應到下面四個 describe 裡標「條件 N」的測試。
 */

import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import {
  ALL_DENY,
  type Cell,
  EXISTING_OBJECT,
  MANAGER_ONLY,
  MB,
  MEMBER_READ,
  OTHER_GID,
  S,
  anonStorage,
  bytes,
  createTestEnv,
  reseed,
  reseedStorage,
  storageOf,
  table,
  ACTOR_UID,
  GID,
} from './helpers';

const PNG = { contentType: 'image/png' } as const;
const LIMIT = 30 * MB;

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await reseed(env);
  await reseedStorage(env);
});

async function run(cell: Cell, op: (s: FirebaseStorage) => Promise<unknown>): Promise<void> {
  const storage = storageOf(env, cell.actor);
  if (cell.allowed) await assertSucceeds(op(storage));
  else await assertFails(op(storage));
}

// =============================================================================
// 下載（條件 1：成員身分）
// =============================================================================

describe('Storage｜下載檔案', () => {
  it.each(table(MEMBER_READ))('$actor — 應被$label', async (cell) => {
    await run(cell, (s) => getDownloadURL(ref(s, S.file(EXISTING_OBJECT))));
  });

  it('條件 1：未登入 — 應被拒絕', async () => {
    await assertFails(getDownloadURL(ref(anonStorage(env), S.file(EXISTING_OBJECT))));
  });

  it('列出群組資料夾 — 檢視者應被允許', async () => {
    await assertSucceeds(listAll(ref(storageOf(env, '檢視者'), `groups/${GID}`)));
  });

  it('列出群組資料夾 — 非成員應被拒絕', async () => {
    await assertFails(listAll(ref(storageOf(env, '非成員'), `groups/${GID}`)));
  });

  it('下載別的群組的檔案 — 應被拒絕', async () => {
    await assertFails(
      getDownloadURL(ref(storageOf(env, '擁有者'), S.file(EXISTING_OBJECT, OTHER_GID))),
    );
  });

  it('下載 groups/ 以外的路徑 — 擁有者也應被拒絕', async () => {
    await assertFails(getDownloadURL(ref(storageOf(env, '擁有者'), S.outside(EXISTING_OBJECT))));
  });
});

// =============================================================================
// 上傳（條件 2：管理者身分）
// =============================================================================

describe('Storage｜上傳檔案（≤ 30 MB、非 video/*）', () => {
  it.each(table(MANAGER_ONLY))('$actor — 應被$label', async (cell) => {
    await run(cell, (s) =>
      uploadBytes(ref(s, S.file(`${ACTOR_UID[cell.actor]}.png`)), bytes(1024), PNG),
    );
  });

  it('條件 2：檢視者上傳合法大小與型別的檔案 — 仍應被拒絕', async () => {
    await assertFails(
      uploadBytes(ref(storageOf(env, '檢視者'), S.file('viewer.png')), bytes(1024), PNG),
    );
  });

  it('未登入上傳 — 應被拒絕', async () => {
    await assertFails(uploadBytes(ref(anonStorage(env), S.file('anon.png')), bytes(1024), PNG));
  });

  it('上傳到 groups/ 以外的路徑 — 擁有者也應被拒絕', async () => {
    await assertFails(
      uploadBytes(ref(storageOf(env, '擁有者'), S.outside('x.png')), bytes(1024), PNG),
    );
  });

  it('上傳到別的群組 — 應被拒絕', async () => {
    await assertFails(
      uploadBytes(ref(storageOf(env, '管理者'), S.file('x.png', OTHER_GID)), bytes(1024), PNG),
    );
  });

  it('覆寫既有物件 — 管理者應被允許', async () => {
    await assertSucceeds(
      uploadBytes(ref(storageOf(env, '管理者'), S.file(EXISTING_OBJECT)), bytes(2048), PNG),
    );
  });
});

// =============================================================================
// 條件 3：30 MB 上限
// =============================================================================

describe('Storage｜上傳超過 30 MB', () => {
  it.each(table(ALL_DENY))(
    '$actor — 應被$label',
    async (cell) => {
      await run(cell, (s) => uploadBytes(ref(s, S.file('big.png')), bytes(LIMIT + 1), PNG));
    },
    120_000,
  );

  it(
    '條件 3：剛好 30 MB — 管理者應被允許',
    async () => {
      await assertSucceeds(
        uploadBytes(ref(storageOf(env, '管理者'), S.file('exact.png')), bytes(LIMIT), PNG),
      );
    },
    120_000,
  );
});

// =============================================================================
// 條件 4：拒絕 video/*
// =============================================================================

describe('Storage｜上傳 video/*', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (s) =>
      uploadBytes(ref(s, S.file('clip.mp4')), bytes(1024), { contentType: 'video/mp4' }),
    );
  });

  it('條件 4：管理者上傳 1 KB 的 video/mp4 — 仍應被拒絕', async () => {
    await assertFails(
      uploadBytes(ref(storageOf(env, '管理者'), S.file('clip.mp4')), bytes(1024), {
        contentType: 'video/mp4',
      }),
    );
  });

  it('條件 4：video/quicktime 也應被拒絕', async () => {
    await assertFails(
      uploadBytes(ref(storageOf(env, '管理者'), S.file('clip.mov')), bytes(1024), {
        contentType: 'video/quicktime',
      }),
    );
  });

  it('audio/* 不在封鎖範圍 — 管理者應被允許', async () => {
    await assertSucceeds(
      uploadBytes(ref(storageOf(env, '管理者'), S.file('rec.m4a')), bytes(1024), {
        contentType: 'audio/mp4',
      }),
    );
  });
});

// =============================================================================
// 刪除物件：一律拒絕
// =============================================================================

describe('Storage｜刪除物件', () => {
  it.each(table(ALL_DENY))('$actor — 應被$label', async (cell) => {
    await run(cell, (s) => deleteObject(ref(s, S.file(EXISTING_OBJECT))));
  });

  it('未登入刪除 — 應被拒絕', async () => {
    await assertFails(deleteObject(ref(anonStorage(env), S.file(EXISTING_OBJECT))));
  });
});
