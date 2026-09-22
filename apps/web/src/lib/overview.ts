/**
 * 跨科目的作業查詢（總覽頁與作業頁）。
 *
 * 用 collection group 一次把整個群組的作業查回來，比一個科目查一次省很多。
 * 對應 firestore.indexes.json 的第 1 個複合索引：
 *   items (CG) gid ↑, type ↑, deletedAt ↑, dueAt ↑
 *
 * 安全規則的 collection group 那一條是
 *   allow read: if isMember(resource.data.gid) && notDeleted()
 * 所以查詢一定要同時帶 gid 與 deletedAt == null，少一個整個查詢就會被拒。
 */

import {
  collectionGroup,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { docConverter } from './converters';
import { db } from './firebase';
import type { ItemRow } from './items';

/** 逾期多久之前的就不再顯示。太舊的作業擺在總覽只是噪音。 */
export const OVERDUE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * 訂閱有到期日的作業。
 *
 * from / to 是毫秒範圍，落在範圍外的不會回來。沒有到期日的作業
 * 因為 dueAt 是 null，不會通過範圍條件，所以這裡看不到——
 * 那些交給作業頁用 watchAllHomework() 查。
 */
export function watchHomeworkInRange(
  gid: string,
  from: number,
  to: number,
  onChange: (rows: ItemRow[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collectionGroup(db, 'items').withConverter(docConverter<ItemRow>()),
    where('gid', '==', gid),
    where('type', '==', 'homework'),
    where('deletedAt', '==', null),
    where('dueAt', '>=', from),
    where('dueAt', '<=', to),
    orderBy('dueAt'),
  );
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => d.data())), onError);
}

/** 整個群組的作業，依到期日排序。沒有到期日的排在最後。 */
export function watchAllHomework(
  gid: string,
  onChange: (rows: ItemRow[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collectionGroup(db, 'items').withConverter(docConverter<ItemRow>()),
    where('gid', '==', gid),
    where('type', '==', 'homework'),
    where('deletedAt', '==', null),
    orderBy('dueAt'),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => d.data());
      rows.sort(
        (a, b) =>
          (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY),
      );
      onChange(rows);
    },
    onError,
  );
}
