/**
 * 邀請連結 Callable 的整合測試（步驟 4）。
 *
 * 跑在 Auth + Firestore + Functions Emulator 上，走真正的 HTTP，
 * 所以 App Check 強制、Admin SDK 寫 roles、觸發器同步索引都會真的被執行。
 */

import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';

import { callFunction, clearAuth, createTestUser, type TestUser } from './callable';
import { createTestEnv } from './helpers';

const GID = 'g_invite';

let env: RulesTestEnvironment;
let owner: TestUser;
let admin: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let seq = 0;

/** 每個測試用不同的信箱，避免 Auth Emulator 的帳號衝突。 */
function email(role: string): string {
  seq += 1;
  return `${role}${seq}@example.com`;
}

async function adminWrite(fn: (db: Firestore) => Promise<void>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}

async function seedGroup(): Promise<void> {
  await adminWrite(async (db) => {
    await setDoc(doc(db, `groups/${GID}`), {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
      name: '資工一甲',
      ownerUid: owner.uid,
      roles: { [owner.uid]: 'owner', [admin.uid]: 'admin', [viewer.uid]: 'viewer' },
      memberUids: [owner.uid, admin.uid, viewer.uid],
      activeSemesterId: null,
    });
  });
}

async function readGroup(): Promise<Record<string, unknown>> {
  let data: Record<string, unknown> = {};
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore() as unknown as Firestore, `groups/${GID}`));
    data = snap.data() as Record<string, unknown>;
  });
  return data;
}

interface IssuedInvite {
  inviteId: string;
  token: string;
  expiresAt: number | null;
}

async function issueInvite(user: TestUser, expiresAt: number | null = null): Promise<IssuedInvite> {
  const res = await callFunction<IssuedInvite>(
    'createInvite',
    { gid: GID, expiresAt },
    { idToken: user.idToken },
  );
  expect(res.errorMessage).toBeNull();
  return res.result as IssuedInvite;
}

beforeAll(async () => {
  env = await createTestEnv();
}, 60_000);

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await clearAuth();
  owner = await createTestUser(email('owner'), '擁有者');
  admin = await createTestUser(email('admin'), '管理者');
  viewer = await createTestUser(email('viewer'), '檢視者');
  outsider = await createTestUser(email('outsider'), '非成員');
  await seedGroup();
}, 60_000);

// =============================================================================
// App Check
// =============================================================================

describe('App Check 強制', () => {
  it('沒有帶 App Check token 一律被拒', async () => {
    const res = await callFunction('createInvite', { gid: GID }, {
      idToken: owner.idToken,
      appCheck: false,
    });
    expect(res.ok).toBe(false);
    expect(res.errorStatus).toBe('UNAUTHENTICATED');
  });

  it('帶了 App Check 但沒登入也會被拒', async () => {
    const res = await callFunction('createInvite', { gid: GID }, { idToken: null });
    expect(res.ok).toBe(false);
    expect(res.errorStatus).toBe('UNAUTHENTICATED');
  });
});

// =============================================================================
// createInvite
// =============================================================================

describe('createInvite', () => {
  it('擁有者可以建立', async () => {
    const invite = await issueInvite(owner);
    expect(invite.token).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(invite.expiresAt).toBeNull();
  });

  it('管理者可以建立', async () => {
    const invite = await issueInvite(admin);
    expect(invite.inviteId).toBeTruthy();
  });

  it('檢視者不能建立', async () => {
    const res = await callFunction('createInvite', { gid: GID }, { idToken: viewer.idToken });
    expect(res.errorStatus).toBe('PERMISSION_DENIED');
  });

  it('非成員不能建立', async () => {
    const res = await callFunction('createInvite', { gid: GID }, { idToken: outsider.idToken });
    expect(res.errorStatus).toBe('PERMISSION_DENIED');
  });

  it('不存在的群組回 NOT_FOUND', async () => {
    const res = await callFunction('createInvite', { gid: 'nope' }, { idToken: owner.idToken });
    expect(res.errorStatus).toBe('NOT_FOUND');
  });

  it('明碼 token 不會被存進 Firestore', async () => {
    const invite = await issueInvite(owner);
    let stored: Record<string, unknown> = {};
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(
        doc(ctx.firestore() as unknown as Firestore, `groups/${GID}/invites/${invite.inviteId}`),
      );
      stored = snap.data() as Record<string, unknown>;
    });
    expect(JSON.stringify(stored)).not.toContain(invite.token);
    expect(String(stored.tokenHash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('過去的到期時間會被拒絕', async () => {
    const res = await callFunction(
      'createInvite',
      { gid: GID, expiresAt: Date.now() - 1000 },
      { idToken: owner.idToken },
    );
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
  });
});

// =============================================================================
// joinByInvite
// =============================================================================

describe('joinByInvite', () => {
  it('用有效連結加入後成為檢視者，並寫進 roles', async () => {
    const invite = await issueInvite(owner);
    const res = await callFunction<{ gid: string; role: string; alreadyMember: boolean }>(
      'joinByInvite',
      { token: invite.token },
      { idToken: outsider.idToken },
    );

    expect(res.ok).toBe(true);
    expect(res.result?.role).toBe('viewer');
    expect(res.result?.alreadyMember).toBe(false);

    const group = await readGroup();
    expect((group.roles as Record<string, string>)[outsider.uid]).toBe('viewer');
    expect(group.memberUids as string[]).toContain(outsider.uid);
  });

  it('同一個人再加入一次會回 alreadyMember', async () => {
    const invite = await issueInvite(owner);
    await callFunction('joinByInvite', { token: invite.token }, { idToken: outsider.idToken });
    const again = await callFunction<{ alreadyMember: boolean; role: string }>(
      'joinByInvite',
      { token: invite.token },
      { idToken: outsider.idToken },
    );
    expect(again.result?.alreadyMember).toBe(true);
    expect(again.result?.role).toBe('viewer');
  });

  it('已經是管理者的人用連結加入不會被降級', async () => {
    const invite = await issueInvite(owner);
    const res = await callFunction<{ role: string }>(
      'joinByInvite',
      { token: invite.token },
      { idToken: admin.idToken },
    );
    expect(res.result?.role).toBe('admin');
    const group = await readGroup();
    expect((group.roles as Record<string, string>)[admin.uid]).toBe('admin');
  });

  it('格式不對的 token 直接被擋掉', async () => {
    const res = await callFunction('joinByInvite', { token: 'nope' }, { idToken: outsider.idToken });
    expect(res.errorStatus).toBe('INVALID_ARGUMENT');
  });

  it('沒登入不能加入', async () => {
    const invite = await issueInvite(owner);
    const res = await callFunction('joinByInvite', { token: invite.token }, { idToken: null });
    expect(res.errorStatus).toBe('UNAUTHENTICATED');
  });

  it('格式正確但不存在的 token 回 NOT_FOUND', async () => {
    const res = await callFunction(
      'joinByInvite',
      { token: 'a'.repeat(32) },
      { idToken: outsider.idToken },
    );
    expect(res.errorStatus).toBe('NOT_FOUND');
  });

  it('已過期的連結不能用', async () => {
    const invite = await issueInvite(owner, Date.now() + 60_000);
    // 直接把到期時間改到過去，模擬時間流逝。
    await adminWrite(async (db) => {
      await setDoc(
        doc(db, `groups/${GID}/invites/${invite.inviteId}`),
        { expiresAt: new Date(Date.now() - 1000) },
        { merge: true },
      );
    });
    const res = await callFunction(
      'joinByInvite',
      { token: invite.token },
      { idToken: outsider.idToken },
    );
    expect(res.errorStatus).toBe('NOT_FOUND');
  });

  it('群組已軟刪除時不能加入', async () => {
    const invite = await issueInvite(owner);
    await adminWrite(async (db) => {
      await setDoc(doc(db, `groups/${GID}`), { deletedAt: new Date() }, { merge: true });
    });
    const res = await callFunction(
      'joinByInvite',
      { token: invite.token },
      { idToken: outsider.idToken },
    );
    expect(res.errorStatus).toBe('NOT_FOUND');
  });

  it('超過速率上限後會被擋下來', async () => {
    const user = await createTestUser(email('flood'));
    const statuses: (string | null)[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await callFunction(
        'joinByInvite',
        { token: 'b'.repeat(32) },
        { idToken: user.idToken },
      );
      statuses.push(res.errorStatus);
    }
    expect(statuses.filter((s) => s === 'NOT_FOUND')).toHaveLength(10);
    expect(statuses.filter((s) => s === 'RESOURCE_EXHAUSTED')).toHaveLength(2);
  }, 60_000);
});

// =============================================================================
// rotateInvite
// =============================================================================

describe('rotateInvite', () => {
  it('重新產生後舊連結立即失效，新連結可用', async () => {
    const first = await issueInvite(owner);
    const rotated = await callFunction<IssuedInvite & { revoked: number }>(
      'rotateInvite',
      { gid: GID, expiresAt: null },
      { idToken: owner.idToken },
    );
    expect(rotated.ok).toBe(true);
    expect(rotated.result?.revoked).toBe(1);
    expect(rotated.result?.token).not.toBe(first.token);

    const old = await callFunction(
      'joinByInvite',
      { token: first.token },
      { idToken: outsider.idToken },
    );
    expect(old.errorStatus).toBe('NOT_FOUND');

    const fresh = await callFunction<{ role: string }>(
      'joinByInvite',
      { token: rotated.result!.token },
      { idToken: outsider.idToken },
    );
    expect(fresh.result?.role).toBe('viewer');
  });

  it('檢視者不能重新產生', async () => {
    const res = await callFunction('rotateInvite', { gid: GID }, { idToken: viewer.idToken });
    expect(res.errorStatus).toBe('PERMISSION_DENIED');
  });
});

// =============================================================================
// updateInviteExpiry / listInvites
// =============================================================================

describe('updateInviteExpiry', () => {
  it('管理者可以改到期時間', async () => {
    const invite = await issueInvite(owner);
    const at = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const res = await callFunction<{ expiresAt: number }>(
      'updateInviteExpiry',
      { gid: GID, inviteId: invite.inviteId, expiresAt: at },
      { idToken: admin.idToken },
    );
    expect(res.result?.expiresAt).toBe(at);
  });

  it('檢視者不能改', async () => {
    const invite = await issueInvite(owner);
    const res = await callFunction(
      'updateInviteExpiry',
      { gid: GID, inviteId: invite.inviteId, expiresAt: null },
      { idToken: viewer.idToken },
    );
    expect(res.errorStatus).toBe('PERMISSION_DENIED');
  });

  it('已失效的邀請不能再改', async () => {
    const invite = await issueInvite(owner);
    await callFunction('rotateInvite', { gid: GID }, { idToken: owner.idToken });
    const res = await callFunction(
      'updateInviteExpiry',
      { gid: GID, inviteId: invite.inviteId, expiresAt: null },
      { idToken: owner.idToken },
    );
    expect(res.errorStatus).toBe('FAILED_PRECONDITION');
  });
});

describe('listInvites', () => {
  it('管理者看得到中繼資料，但看不到 token', async () => {
    const invite = await issueInvite(owner);
    const res = await callFunction<{ invites: Record<string, unknown>[] }>(
      'listInvites',
      { gid: GID },
      { idToken: admin.idToken },
    );
    expect(res.ok).toBe(true);
    expect(res.result?.invites).toHaveLength(1);
    expect(JSON.stringify(res.result)).not.toContain(invite.token);
    expect(res.result?.invites[0]?.rejection).toBeNull();
  });

  it('檢視者看不到', async () => {
    const res = await callFunction('listInvites', { gid: GID }, { idToken: viewer.idToken });
    expect(res.errorStatus).toBe('PERMISSION_DENIED');
  });
});

// =============================================================================
// peekInvite
// =============================================================================

describe('peekInvite', () => {
  it('未登入也能確認連結是否有效', async () => {
    const invite = await issueInvite(owner);
    const res = await callFunction<{ valid: boolean; groupName: string | null }>(
      'peekInvite',
      { token: invite.token },
      { idToken: null },
    );
    expect(res.result?.valid).toBe(true);
    expect(res.result?.groupName).toBe('資工一甲');
  });

  it('不會洩漏無效連結所屬的群組名稱', async () => {
    const invite = await issueInvite(owner);
    await callFunction('rotateInvite', { gid: GID }, { idToken: owner.idToken });
    const res = await callFunction<{ valid: boolean; reason: string; groupName: string | null }>(
      'peekInvite',
      { token: invite.token },
      { idToken: null },
    );
    expect(res.result?.valid).toBe(false);
    expect(res.result?.reason).toBe('revoked');
    expect(res.result?.groupName).toBeNull();
  });
});
