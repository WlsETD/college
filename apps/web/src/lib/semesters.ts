/**
 * 學期。
 *
 * 「目前學期」記在 groups/{gid}.activeSemesterId，不是在學期文件上放 isActive——
 * 那樣要同時改兩筆才能保證只有一個，而規則擋不住中間狀態。
 */

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
import type { Semester } from '@jindu/shared';

import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
  docConverter,
  restoreFields,
  softDeleteFields,
} from './converters';
import { db } from './firebase';

export type SemesterRow = Semester;

export function watchSemesters(
  gid: string,
  onChange: (rows: SemesterRow[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  // 規則不會替你濾掉已刪除的，查詢一定要自己帶 deletedAt == null。
  const q = query(
    collection(db, `groups/${gid}/semesters`).withConverter(docConverter<SemesterRow>()),
    where('deletedAt', '==', null),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => d.data());
      rows.sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name));
      onChange(rows);
    },
    onError,
  );
}

export interface SemesterInput {
  name: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
}

export async function createSemester(gid: string, input: SemesterInput): Promise<string> {
  const ref = doc(collection(db, `groups/${gid}/semesters`));
  await setDoc(ref, {
    ...auditFieldsForCreate(),
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
  });
  return ref.id;
}

export async function updateSemester(
  gid: string,
  semId: string,
  patch: Partial<SemesterInput>,
): Promise<void> {
  await updateDoc(doc(db, `groups/${gid}/semesters/${semId}`), {
    ...auditFieldsForUpdate(),
    ...patch,
  });
}

export async function softDeleteSemester(gid: string, semId: string): Promise<void> {
  await updateDoc(doc(db, `groups/${gid}/semesters/${semId}`), softDeleteFields());
}

export async function restoreSemester(gid: string, semId: string): Promise<void> {
  await updateDoc(doc(db, `groups/${gid}/semesters/${semId}`), restoreFields());
}

/** 切換目前學期。傳 null 代表清空。 */
export async function setActiveSemester(gid: string, semId: string | null): Promise<void> {
  await updateDoc(doc(db, `groups/${gid}`), {
    ...auditFieldsForUpdate(),
    activeSemesterId: semId,
  });
}
