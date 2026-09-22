/**
 * Firestore ⇄ 應用層型別的轉換。
 *
 * packages/shared 的型別把時間一律當成毫秒數（Millis），Firestore 存的是
 * Timestamp——這是 types.ts 註解裡就寫明的分工。轉換集中在這裡，
 * 頁面拿到的永遠是 Millis。
 *
 * 軟刪除的寫法有硬性規定（見 firestore.rules）：
 *   - 刪除＝把 deletedAt 由 null 改成 serverTimestamp()，規則會比對 request.time，
 *     所以不能自己算一個毫秒數塞進去。
 *   - 復原＝改回 null，只有擁有者與管理者能做。
 *   - 硬刪除（deleteDoc）一律會被拒絕。
 */

import {
  Timestamp,
  serverTimestamp,
  type DocumentData,
  type FieldValue,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
} from 'firebase/firestore';

export function toMillis(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return null;
}

/** 新文件共用的三個欄位。 */
export function auditFieldsForCreate(): {
  createdAt: FieldValue;
  updatedAt: FieldValue;
  deletedAt: null;
} {
  return {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deletedAt: null,
  };
}

export function auditFieldsForUpdate(): { updatedAt: FieldValue } {
  return { updatedAt: serverTimestamp() };
}

/** 軟刪除。規則要求 deletedAt 必須等於 request.time。 */
export function softDeleteFields(): { deletedAt: FieldValue; updatedAt: FieldValue } {
  return { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() };
}

/** 復原。 */
export function restoreFields(): { deletedAt: null; updatedAt: FieldValue } {
  return { deletedAt: null, updatedAt: serverTimestamp() };
}

/**
 * 把文件的時間欄位從 Timestamp 換成 Millis，並補上 id。
 * 只做讀取方向；寫入方向各自用上面的 helper，型別比較清楚。
 */
export function docConverter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(model: T): DocumentData {
      const { id: _id, ...rest } = model;
      return rest as DocumentData;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): T {
      const raw = snapshot.data(options);
      const mapped: DocumentData = { id: snapshot.id };
      for (const [key, value] of Object.entries(raw)) {
        mapped[key] = value instanceof Timestamp ? value.toMillis() : value;
      }
      return mapped as T;
    },
  };
}
