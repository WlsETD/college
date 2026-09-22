/**
 * 章節樹。固定兩層：章（parentId 為 null、depth 0）與小節（depth 1）。
 *
 * 整棵樹一次查回來再在前端組結構，不逐層查：一個科目的章節就是一份目錄，
 * 量很小，而且只用得到 deletedAt 的單一欄位索引。
 */

import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  moveItem,
  orderForAppend,
  ordersForBatch,
  sortByOrder,
  type Chapter,
  type ParsedOutline,
} from '@jindu/shared';

import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
  docConverter,
  softDeleteFields,
} from './converters';
import { db } from './firebase';

export type ChapterRow = Chapter;

export interface ChapterNode extends ChapterRow {
  sections: ChapterRow[];
}

function chaptersPath(gid: string, semId: string, subId: string): string {
  return `groups/${gid}/semesters/${semId}/subjects/${subId}/chapters`;
}

export function watchChapters(
  gid: string,
  semId: string,
  subId: string,
  onChange: (rows: ChapterRow[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, chaptersPath(gid, semId, subId)).withConverter(docConverter<ChapterRow>()),
    where('deletedAt', '==', null),
  );
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => d.data())), onError);
}

/** 把扁平的章節列表組成兩層樹，同層依 order 排序。 */
export function buildTree(rows: readonly ChapterRow[]): ChapterNode[] {
  const chapters = sortByOrder(rows.filter((r) => r.parentId === null)).map((c) => ({
    ...c,
    sections: [] as ChapterRow[],
  }));
  const byId = new Map(chapters.map((c) => [c.id, c]));

  for (const row of sortByOrder(rows.filter((r) => r.parentId !== null))) {
    byId.get(row.parentId as string)?.sections.push(row);
  }
  return chapters;
}

export interface ChapterInput {
  title: string;
  number: string | null;
  parentId: string | null;
}

export async function createChapter(
  gid: string,
  semId: string,
  subId: string,
  input: ChapterInput,
  siblings: readonly ChapterRow[],
): Promise<string> {
  const ref = doc(collection(db, chaptersPath(gid, semId, subId)));
  await setDoc(ref, {
    ...auditFieldsForCreate(),
    title: input.title.trim(),
    number: input.number,
    parentId: input.parentId,
    depth: input.parentId === null ? 0 : 1,
    order: orderForAppend(siblings),
  });
  return ref.id;
}

export async function renameChapter(
  gid: string,
  semId: string,
  subId: string,
  chapId: string,
  patch: { title?: string; number?: string | null },
): Promise<void> {
  const clean: Record<string, unknown> = { ...auditFieldsForUpdate() };
  if (patch.title !== undefined) clean.title = patch.title.trim();
  if (patch.number !== undefined) clean.number = patch.number;
  await updateDoc(doc(db, `${chaptersPath(gid, semId, subId)}/${chapId}`), clean);
}

/**
 * 軟刪除一個章節。刪章時底下的小節也一起刪——留著孤兒小節在樹上是顯示不出來的。
 */
export async function softDeleteChapter(
  gid: string,
  semId: string,
  subId: string,
  chapId: string,
  all: readonly ChapterRow[],
): Promise<void> {
  const path = chaptersPath(gid, semId, subId);
  const children = all.filter((row) => row.parentId === chapId);

  const batch = writeBatch(db);
  batch.update(doc(db, `${path}/${chapId}`), softDeleteFields());
  for (const child of children) {
    batch.update(doc(db, `${path}/${child.id}`), softDeleteFields());
  }
  await batch.commit();
}

/** 在同一層內上下移動。 */
export async function moveChapter(
  gid: string,
  semId: string,
  subId: string,
  all: readonly ChapterRow[],
  chapId: string,
  direction: -1 | 1,
): Promise<void> {
  const target = all.find((row) => row.id === chapId);
  if (!target) return;

  const siblings = all.filter((row) => row.parentId === target.parentId);
  const updates = moveItem(siblings, chapId, direction);
  if (updates.length === 0) return;

  const path = chaptersPath(gid, semId, subId);
  const batch = writeBatch(db);
  for (const update of updates) {
    batch.update(doc(db, `${path}/${update.id}`), {
      ...auditFieldsForUpdate(),
      order: update.order,
    });
  }
  await batch.commit();
}

/**
 * 精靈步驟 2：把 parseOutline() 的結果一次寫進去。
 *
 * 章與小節必須在同一個 batch 裡，否則中途失敗會留下沒有父節點的小節。
 * Firestore 的 batch 上限是 500 筆，超過就分批送。
 */
const BATCH_LIMIT = 450;

export async function createChaptersFromOutline(
  gid: string,
  semId: string,
  subId: string,
  outline: ParsedOutline,
  existing: readonly ChapterRow[],
): Promise<number> {
  const path = chaptersPath(gid, semId, subId);
  const chapterOrders = ordersForBatch(
    existing.filter((row) => row.parentId === null),
    outline.chapters.length,
  );

  type Pending = { ref: ReturnType<typeof doc>; data: Record<string, unknown> };
  const pending: Pending[] = [];

  outline.chapters.forEach((chapter, index) => {
    const chapterRef = doc(collection(db, path));
    pending.push({
      ref: chapterRef,
      data: {
        ...auditFieldsForCreate(),
        title: chapter.title || chapter.raw || `第 ${index + 1} 章`,
        number: chapter.number,
        parentId: null,
        depth: 0,
        order: chapterOrders[index] ?? (index + 1) * 100,
      },
    });

    chapter.sections.forEach((section, sIndex) => {
      pending.push({
        ref: doc(collection(db, path)),
        data: {
          ...auditFieldsForCreate(),
          title: section.title || section.raw,
          number: section.number,
          parentId: chapterRef.id,
          depth: 1,
          order: (sIndex + 1) * 100,
        },
      });
    });
  });

  for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const item of pending.slice(i, i + BATCH_LIMIT)) {
      batch.set(item.ref, item.data);
    }
    await batch.commit();
  }

  return pending.length;
}
