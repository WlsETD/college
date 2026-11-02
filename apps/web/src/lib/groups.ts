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
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Role, UserGroupRef } from '@jindu/shared';

import { auditFieldsForCreate, auditFieldsForUpdate, docConverter, toMillis } from './converters';
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
    kind: 'shared',
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
// 群組文件本身
// -----------------------------------------------------------------------------

export interface GroupDoc {
  id: string;
  name: string;
  ownerUid: string;
  roles: Record<string, Role>;
  activeSemesterId: string | null;
}

/** 訂閱目前群組的文件。權限與「目前學期」都記在這裡。 */
export function watchGroupDoc(
  gid: string,
  onChange: (group: GroupDoc | null) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const ref = doc(db, `groups/${gid}`).withConverter(docConverter<GroupDoc>());
  return onSnapshot(ref, (snap) => onChange(snap.exists() ? snap.data() : null), onError);
}

// -----------------------------------------------------------------------------
// 角色管理
//
// 三個操作都是整包覆寫 roles 欄位，對得上規則的三種分支：
//   setMemberRole   → owner 專用，isOwnerRoleEdit（升降級，不能碰自己）
//   removeMember    → owner 用同一條 isOwnerRoleEdit 踢任何人；
//                     admin 只能踢 viewer，走 isViewerRemoval
//   transferOwnership → owner 專用，isOwnershipTransfer，自己同時降為 admin
// 呼叫端要傳目前最新的 roles map，規則會依「整個文件」的前後差異判斷合法性。
// -----------------------------------------------------------------------------

export async function setMemberRole(
  gid: string,
  roles: Record<string, Role>,
  targetUid: string,
  newRole: 'admin' | 'viewer',
): Promise<void> {
  await updateDoc(doc(db, `groups/${gid}`), {
    ...auditFieldsForUpdate(),
    roles: { ...roles, [targetUid]: newRole },
  });
}

export async function removeMember(
  gid: string,
  roles: Record<string, Role>,
  targetUid: string,
): Promise<void> {
  const next = { ...roles };
  delete next[targetUid];
  await updateDoc(doc(db, `groups/${gid}`), {
    ...auditFieldsForUpdate(),
    roles: next,
  });
}

export async function transferOwnership(
  gid: string,
  roles: Record<string, Role>,
  currentOwnerUid: string,
  newOwnerUid: string,
): Promise<void> {
  await updateDoc(doc(db, `groups/${gid}`), {
    ...auditFieldsForUpdate(),
    ownerUid: newOwnerUid,
    roles: { ...roles, [newOwnerUid]: 'owner', [currentOwnerUid]: 'admin' },
  });
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
