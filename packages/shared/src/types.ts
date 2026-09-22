/**
 * 共用資料型別。
 *
 * 對應 firestore 的集合結構。所有文件都有 createdAt / updatedAt / deletedAt；
 * 刪除一律軟刪除（寫入 deletedAt），查詢時以 deletedAt == null 排除。
 *
 * 注意：Firestore 安全規則無法在 list 查詢時替你過濾資料。只要結果集裡
 * 可能包含 deletedAt 不為 null 的文件，整個查詢就會被拒絕，所以每一個
 * 查詢都必須自己帶上 where('deletedAt', '==', null)。
 */

import type { IsoWeekday } from './tz';
import type { ClassSlot } from './nextClass';

/** 毫秒時間戳。寫入 Firestore 時轉成 Timestamp。 */
export type Millis = number;

export interface SoftDeletable {
  createdAt: Millis;
  updatedAt: Millis;
  /** null 代表未刪除。 */
  deletedAt: Millis | null;
}

export type Role = 'owner' | 'admin' | 'viewer';

/** admin 與 owner 都算管理者。 */
export const MANAGER_ROLES: readonly Role[] = ['owner', 'admin'];

export function isManager(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/** groups/{gid} */
export interface Group extends SoftDeletable {
  id: string;
  name: string;
  ownerUid: string;
  /** 權限判斷的單一來源。安全規則只讀這個欄位。 */
  roles: Record<string, Role>;
  memberUids: string[];
  activeSemesterId: string | null;
}

/** groups/{gid}/invites/{inviteId} —— 前端不可讀，只由 Cloud Functions 存取。 */
export interface Invite extends SoftDeletable {
  id: string;
  /** 只存雜湊，明碼 token 只出現在邀請連結裡。 */
  tokenHash: string;
  role: Extract<Role, 'viewer'>;
  expiresAt: Millis | null;
  revokedAt: Millis | null;
  createdBy: string;
}

/** groups/{gid}/members/{uid} */
export interface Member extends SoftDeletable {
  uid: string;
  displayName: string;
  photoURL: string | null;
  joinedAt: Millis;
  /** 「我修的科目」。只有本人可以改自己這一筆。 */
  enrolledSubjectIds: string[];
}

/** groups/{gid}/semesters/{semId} */
export interface Semester extends SoftDeletable {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
}

/** 科目的 12 色索引，0–11。實際色碼由前端的設計 token 決定。 */
export type SubjectColorIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** groups/{gid}/semesters/{semId}/subjects/{subId} */
export interface Subject extends SoftDeletable {
  id: string;
  name: string;
  /** 3 字以內的簡稱。 */
  shortName: string;
  colorIndex: SubjectColorIndex;
  schedule: ClassSlot[];
  /** 目前進度指向的章節 id。 */
  currentChapterId: string | null;
  order: number;
}

/** .../subjects/{subId}/chapters/{chapId} —— 固定兩層：章（parentId 為 null）與小節。 */
export interface Chapter extends SoftDeletable {
  id: string;
  title: string;
  /** 解析目錄得到的編號，例如 "1" 或 "1-1"。 */
  number: string | null;
  parentId: string | null;
  /** 0 = 章，1 = 小節。 */
  depth: 0 | 1;
  /** 以 100 為間隔，之後插入不必重排全部。 */
  order: number;
}

export type ItemType = 'homework' | 'keyword' | 'file' | 'link';

/** .../subjects/{subId}/items/{itemId} */
export interface Item extends SoftDeletable {
  id: string;
  type: ItemType;
  title: string;
  /** 關鍵字的說明欄，支援 LaTeX。 */
  body: string;
  /** 作業的到期時間。 */
  dueAt: Millis | null;
  chapterId: string | null;
  createdBy: string;
  /** 以下三個為了 collection group 查詢而反正規化。 */
  gid: string;
  semId: string;
  subId: string;
  /** type === 'file' 時的 Storage 路徑與中繼資料。 */
  storagePath?: string;
  contentType?: string;
  sizeBytes?: number;
  /** type === 'link' 時的網址。 */
  url?: string;
}

/** userGroups/{uid}/groups/{gid} —— 多群組切換用的索引，由 Cloud Functions 維護。 */
export interface UserGroupRef {
  gid: string;
  groupName: string;
  role: Role;
  joinedAt: Millis;
}

export type { IsoWeekday, ClassSlot };
