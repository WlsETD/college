/**
 * 群組的建立、讀取與邀請連結操作。
 *
 * 分工：
 *   - 建立群組、建立自己的 members 文件 → 前端直接寫（安全規則允許）。
 *   - userGroups 索引 → 由 Functions 的 onGroupWritten 觸發器維護，
 *     前端只讀。所以剛建好群組時索引會晚一拍出現。
 *   - 邀請連結的一切 → 一定要走 Callable，invites 文件前端讀寫全禁。
 */

import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Role, UserGroupRef } from '@jindu/shared';

import { auditFieldsForCreate, docConverter, toMillis } from './converters';
import { db, functions } from './firebase';

// -----------------------------------------------------------------------------
// 建立群組
// -----------------------------------------------------------------------------

/** 從 Firebase Auth 取得的個人資料，用來建立自己的 members 文件。 */
export interface MemberProfile {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

/**
 * 建立群組，建立者成為擁有者。
 *
 * 兩次寫入不能包成 batch：安全規則判斷成員身分時用的是 get()，
 * 在同一個 batch 裡它讀到的是寫入前的狀態，members 那筆會被拒。
 */
export async function createGroup(name: string, profile: MemberProfile): Promise<string> {
  const groupRef = doc(collection(db, 'groups'));

  await setDoc(groupRef, {
    ...auditFieldsForCreate(),
    name: name.trim(),
    ownerUid: profile.uid,
    roles: { [profile.uid]: 'owner' },
    memberUids: [profile.uid],
    activeSemesterId: null,
  });

  await ensureMemberDoc(groupRef.id, profile);

  return groupRef.id;
}

/** 加入群組後補上自己的 members 文件。只有本人能寫自己這一筆。 */
export async function ensureMemberDoc(gid: string, profile: MemberProfile): Promise<void> {
  await setDoc(
    doc(db, `groups/${gid}/members/${profile.uid}`),
    {
      ...auditFieldsForCreate(),
      uid: profile.uid,
      displayName: profile.displayName,
      photoURL: profile.photoURL,
      joinedAt: Date.now(),
      enrolledSubjectIds: [],
    },
    { merge: true },
  );
}

// -----------------------------------------------------------------------------
// 多群組切換用的索引
// -----------------------------------------------------------------------------

export interface MyGroup extends UserGroupRef {
  id: string;
}

export function watchMyGroups(
  uid: string,
  onChange: (groups: MyGroup[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const ref = collection(db, `userGroups/${uid}/groups`).withConverter(docConverter<MyGroup>());
  return onSnapshot(
    ref,
    (snap) => {
      const rows = snap.docs.map((d) => d.data());
      rows.sort((a, b) => (toMillis(a.joinedAt) ?? 0) - (toMillis(b.joinedAt) ?? 0));
      onChange(rows);
    },
    onError,
  );
}

// -----------------------------------------------------------------------------
// 群組成員（給「成員清單與角色」用）
// -----------------------------------------------------------------------------

export interface MemberRow {
  id: string;
  uid: string;
  displayName: string;
  photoURL: string | null;
}

export function watchMembers(
  gid: string,
  onChange: (members: MemberRow[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  // 每一個查詢都必須自己帶 deletedAt == null，規則不會替你過濾。
  const q = query(
    collection(db, `groups/${gid}/members`).withConverter(docConverter<MemberRow>()),
    where('deletedAt', '==', null),
  );
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => d.data())), onError);
}

// -----------------------------------------------------------------------------
// 邀請連結（全部走 Callable）
// -----------------------------------------------------------------------------

export interface IssuedInvite {
  inviteId: string;
  /** 明碼 token 只會回來這一次，關掉就要重新產生。 */
  token: string;
  expiresAt: number | null;
}

export interface InviteSummary {
  inviteId: string;
  createdAt: number | null;
  createdBy: string | null;
  expiresAt: number | null;
  revokedAt: number | null;
  rejection: 'revoked' | 'expired' | 'deleted' | null;
}

export const callCreateInvite = httpsCallable<
  { gid: string; expiresAt: number | null },
  IssuedInvite
>(functions, 'createInvite');

export const callRotateInvite = httpsCallable<
  { gid: string; expiresAt: number | null },
  IssuedInvite & { revoked: number }
>(functions, 'rotateInvite');

export const callUpdateInviteExpiry = httpsCallable<
  { gid: string; inviteId: string; expiresAt: number | null },
  { inviteId: string; expiresAt: number | null }
>(functions, 'updateInviteExpiry');

export const callListInvites = httpsCallable<{ gid: string }, { invites: InviteSummary[] }>(
  functions,
  'listInvites',
);

export const callJoinByInvite = httpsCallable<
  { token: string },
  { gid: string; groupName: string; role: Role; alreadyMember: boolean }
>(functions, 'joinByInvite');

export const callPeekInvite = httpsCallable<
  { token: string },
  { valid: boolean; reason: string | null; groupName: string | null }
>(functions, 'peekInvite');

/** 邀請連結。明碼 token 只出現在網址裡。 */
export function inviteLink(token: string): string {
  return `${window.location.origin}/join/${token}`;
}
