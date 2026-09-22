/**
 * 作業：依科目／到期日列出全部作業。
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { SubjectChip, SubjectFilter } from '../components/SubjectChip';
import { useGroups } from '../lib/groupContext';
import type { ItemRow } from '../lib/items';
import { watchAllHomework } from '../lib/overview';
import { subjectMap, useCurriculum } from '../lib/useCurriculum';
import { HomeworkCard } from './OverviewPage';

export default function HomeworkPage() {
  const { activeGid, activeSemesterId, activeGroup } = useGroups();
  const { mine, all, filtered, error: curriculumError } = useCurriculum();

  const [rows, setRows] = useState<ItemRow[] | null>(null);
  const [subId, setSubId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!activeGid) return undefined;
    return watchAllHomework(activeGid, setRows, (err) => setError(err.message));
  }, [activeGid]);

  const mineIds = useMemo(() => new Set((mine ?? []).map((s) => s.id)), [mine]);
  const subjects = useMemo(() => subjectMap(all), [all]);

  const visible = useMemo(
    () =>
      (rows ?? []).filter(
        (row) =>
          row.semId === activeSemesterId &&
          mineIds.has(row.subId) &&
          (subId === null || row.subId === subId),
      ),
    [rows, activeSemesterId, mineIds, subId],
  );

  const groupsOfThree = useMemo(() => {
    const overdue = visible.filter((i) => i.dueAt !== null && i.dueAt < now);
    const upcoming = visible.filter((i) => i.dueAt !== null && i.dueAt >= now);
    const undated = visible.filter((i) => i.dueAt === null);
    return { overdue: [...overdue].reverse(), upcoming, undated };
  }, [visible, now]);

  if (!activeSemesterId) {
    return (
      <section>
        <h1>作業</h1>
        <div className="panel">
          <h2>還沒有目前學期</h2>
          <Link className="btn" to="/app/settings">
            去設定
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <p className="eyebrow">{activeGroup?.groupName ?? ''}</p>
      <h1>作業</h1>

      {curriculumError ? <p className="error">▲ {curriculumError}</p> : null}
      {error ? <p className="error">▲ {error}</p> : null}

      <SubjectFilter subjects={mine ?? []} value={subId} onChange={setSubId} />

      <p className="hint">
        共 {visible.length} 件{filtered ? '（只顯示我修的科目）' : ''}
      </p>

      {rows === null ? <p className="hint">載入中…</p> : null}
      {rows !== null && visible.length === 0 ? <p className="hint">沒有作業。</p> : null}

      {groupsOfThree.overdue.length > 0 ? (
        <>
          <h2>已逾期</h2>
          <ul className="card-list">
            {groupsOfThree.overdue.map((item) => (
              <HomeworkCard key={item.id} item={item} subjects={subjects} now={now} overdue />
            ))}
          </ul>
        </>
      ) : null}

      {groupsOfThree.upcoming.length > 0 ? (
        <>
          <h2>未到期</h2>
          <ul className="card-list">
            {groupsOfThree.upcoming.map((item) => (
              <HomeworkCard key={item.id} item={item} subjects={subjects} now={now} />
            ))}
          </ul>
        </>
      ) : null}

      {groupsOfThree.undated.length > 0 ? (
        <>
          <h2>沒有到期日</h2>
          <ul className="card-list">
            {groupsOfThree.undated.map((item) => (
              <li key={item.id} className="card card-stack">
                <div className="card-main">
                  <SubjectChip subject={subjects.get(item.subId)} />
                  <strong>{item.title}</strong>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
