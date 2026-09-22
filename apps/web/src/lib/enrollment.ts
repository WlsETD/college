/**
 * 「我修的科目」。
 *
 * 存在 groups/{gid}/members/{uid}.enrolledSubjectIds，安全規則只讓本人寫自己那筆
 * （權限表：修改別人的「我修的科目」四種角色全部拒絕）。
 *
 * 檢視者在規則層讀得到整個群組的資料，只在前端依這個清單過濾——
 * 逐科目檢查會讓讀取成本與規則複雜度大幅上升（決策：2026-09-22）。
 */

import { doc, onSnapshot, updateDoc, type Unsubscribe } from 'firebase/firestore';

import { auditFieldsForUpdate, docConverter } from './converters';
import { db } from './firebase';

export interface MyMember {
  id: string;
  uid: string;
  displayName: string;
  enrolledSubjectIds: string[];
}

export function watchMyMember(
  gid: string,
  uid: string,
  onChange: (member: MyMember | null) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const ref = doc(db, `groups/${gid}/members/${uid}`).withConverter(docConverter<MyMember>());
  return onSnapshot(ref, (snap) => onChange(snap.exists() ? snap.data() : null), onError);
}

export async function setEnrolledSubjects(
  gid: string,
  uid: string,
  subjectIds: string[],
): Promise<void> {
  await updateDoc(doc(db, `groups/${gid}/members/${uid}`), {
    ...auditFieldsForUpdate(),
    enrolledSubjectIds: subjectIds,
  });
}
