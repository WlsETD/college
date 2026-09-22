/**
 * 科目。
 *
 * 排序用 order（間隔 100），上下移動時和鄰居對調——計算在 @jindu/shared 的
 * order.ts，這裡只負責把結果寫回 Firestore。
 */

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { moveItem, orderForAppend, type ClassSlot, type Subject, type SubjectColorIndex } from '@jindu/shared';

import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
  docConverter,
  softDeleteFields,
} from './converters';
import { db } from './firebase';

export type SubjectRow = Subject;

export const SUBJECT_COLOR_COUNT = 12;

function subjectsPath(gid: string, semId: string): string {
  return `groups/${gid}/semesters/${semId}/subjects`;
}

export function watchSubjects(
  gid: string,
  semId: string,
  onChange: (rows: SubjectRow[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  // 複合索引 (deletedAt, order) 已在 firestore.indexes.json 裡。
  const q = query(
    collection(db, subjectsPath(gid, semId)).withConverter(docConverter<SubjectRow>()),
    where('deletedAt', '==', null),
    orderBy('order'),
  );
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => d.data())), onError);
}

export interface SubjectInput {
  name: string;
  /** 3 字以內。 */
  shortName: string;
  colorIndex: SubjectColorIndex;
  schedule: ClassSlot[];
}

export async function createSubject(
  gid: string,
  semId: string,
  input: SubjectInput,
  existing: readonly SubjectRow[],
): Promise<string> {
  const ref = doc(collection(db, subjectsPath(gid, semId)));
  await setDoc(ref, {
    ...auditFieldsForCreate(),
    name: input.name.trim(),
    shortName: input.shortName.trim().slice(0, 3),
    colorIndex: input.colorIndex,
    schedule: input.schedule,
    currentChapterId: null,
    order: orderForAppend(existing),
  });
  return ref.id;
}

export async function updateSubject(
  gid: string,
  semId: string,
  subId: string,
  patch: Partial<SubjectInput>,
): Promise<void> {
  const clean: Record<string, unknown> = { ...auditFieldsForUpdate() };
  if (patch.name !== undefined) clean.name = patch.name.trim();
  if (patch.shortName !== undefined) clean.shortName = patch.shortName.trim().slice(0, 3);
  if (patch.colorIndex !== undefined) clean.colorIndex = patch.colorIndex;
  if (patch.schedule !== undefined) clean.schedule = patch.schedule;

  await updateDoc(doc(db, `${subjectsPath(gid, semId)}/${subId}`), clean);
}

export async function softDeleteSubject(
  gid: string,
  semId: string,
  subId: string,
): Promise<void> {
  await updateDoc(doc(db, `${subjectsPath(gid, semId)}/${subId}`), softDeleteFields());
}

/** 設定目前進度指向的章節。 */
export async function setCurrentChapter(
  gid: string,
  semId: string,
  subId: string,
  chapterId: string | null,
): Promise<void> {
  await updateDoc(doc(db, `${subjectsPath(gid, semId)}/${subId}`), {
    ...auditFieldsForUpdate(),
    currentChapterId: chapterId,
  });
}

/** 上移（-1）或下移（+1）。已經在頭尾時什麼都不做。 */
export async function moveSubject(
  gid: string,
  semId: string,
  subjects: readonly SubjectRow[],
  subId: string,
  direction: -1 | 1,
): Promise<void> {
  const updates = moveItem(subjects, subId, direction);
  if (updates.length === 0) return;

  const batch = writeBatch(db);
  for (const update of updates) {
    batch.update(doc(db, `${subjectsPath(gid, semId)}/${update.id}`), {
      ...auditFieldsForUpdate(),
      order: update.order,
    });
  }
  await batch.commit();
}
