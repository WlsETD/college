/**
 * 四個分頁共用的資料：目前學期的科目，以及依「我修的科目」過濾後的清單。
 *
 * 安全規則讓檢視者讀得到整個群組的資料，過濾是在前端做的
 * （決策：2026-09-22），所以這個 hook 是唯一的過濾入口，
 * 各頁不要自己再去讀 members。
 */

import { useEffect, useMemo, useState } from 'react';

import { filterEnrolled } from '@jindu/shared';

import { useAuth } from './auth';
import { watchMyMember, type MyMember } from './enrollment';
import { useGroups } from './groupContext';
import { watchSubjects, type SubjectRow } from './subjects';

export interface Curriculum {
  /** 這個學期的所有科目；null 代表還在載入。 */
  all: SubjectRow[] | null;
  /** 依「我修的科目」過濾後的科目。沒選過就等於全部。 */
  mine: SubjectRow[] | null;
  /** 使用者自己勾的科目 id。 */
  enrolled: string[] | null;
  /** 有選過科目，而且選的比全部少。 */
  filtered: boolean;
  error: string | null;
}

export function useCurriculum(): Curriculum {
  const { user } = useAuth();
  const { activeGid, activeSemesterId } = useGroups();
  const [all, setAll] = useState<SubjectRow[] | null>(null);
  const [member, setMember] = useState<MyMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!activeGid || !activeSemesterId) {
      setAll(null);
      return undefined;
    }
    return watchSubjects(activeGid, activeSemesterId, setAll, (err) => setError(err.message));
  }, [activeGid, activeSemesterId]);

  useEffect(() => {
    if (!activeGid || !uid) {
      setMember(null);
      return undefined;
    }
    return watchMyMember(activeGid, uid, setMember, (err) => setError(err.message));
  }, [activeGid, uid]);

  return useMemo(() => {
    const enrolled = member?.enrolledSubjectIds ?? null;
    const mine = all === null ? null : filterEnrolled(all, enrolled);
    return {
      all,
      mine,
      enrolled,
      filtered: mine !== null && all !== null && mine.length < all.length,
      error,
    };
  }, [all, member, error]);
}

/** 給卡片顯示用的科目查表。 */
export function subjectMap(subjects: readonly SubjectRow[] | null): Map<string, SubjectRow> {
  return new Map((subjects ?? []).map((subject) => [subject.id, subject]));
}
