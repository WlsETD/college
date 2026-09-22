/**
 * 總覽：7 天內到期的作業。
 *
 * 一次用 collection group 查整個群組的作業，再依「我修的科目」在前端過濾。
 * 逾期的也列出來——只顯示未來七天，交期已過的反而看不到，那是最需要看到的。
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { OVERVIEW_WINDOW_MS, bucketByDue } from '@jindu/shared';

import { SubjectChip } from '../components/SubjectChip';
import { describeDue, formatDueAt } from '../lib/format';
import { useGroups } from '../lib/groupContext';
import type { ItemRow } from '../lib/items';
import type { SubjectRow } from '../lib/subjects';
import { OVERDUE_WINDOW_MS, watchHomeworkInRange } from '../lib/overview';
import { subjectMap, useCurriculum } from '../lib/useCurriculum';

export default function OverviewPage() {
  const { activeGid, activeSemesterId, activeGroup, groups } = useGroups();
  const { mine, all, filtered, error: curriculumError } = useCurriculum();

  const [rows, setRows] = useState<ItemRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!activeGid) {
      setRows(null);
      return undefined;
    }
    return watchHomeworkInRange(
      activeGid,
      now - OVERDUE_WINDOW_MS,
      now + OVERVIEW_WINDOW_MS,
      setRows,
      (err) => setError(err.message),
    );
  }, [activeGid, now]);

  const mineIds = useMemo(() => new Set((mine ?? []).map((s) => s.id)), [mine]);
  const subjects = useMemo(() => subjectMap(all), [all]);

  const visible = useMemo(
    () =>
      (rows ?? []).filter(
        (row) => row.semId === activeSemesterId && mineIds.has(row.subId),
      ),
    [rows, activeSemesterId, mineIds],
  );

  const { overdue, upcoming } = useMemo(
    () => bucketByDue(visible, now, OVERVIEW_WINDOW_MS),
    [visible, now],
  );

  if (groups !== null && groups.length === 0) {
    return (
      <section>
        <h1>總覽</h1>
        <div className="panel">
          <h2>還沒有群組</h2>
          <p className="hint">先建立一個班群，或請同學把邀請連結給你。</p>
          <Link className="btn" to="/app/settings">
            去設定
          </Link>
        </div>
      </section>
    );
  }

  if (!activeSemesterId) {
    return (
      <section>
        <p className="eyebrow">{activeGroup?.groupName ?? ''}</p>
        <h1>總覽</h1>
        <div className="panel">
          <h2>還沒有目前學期</h2>
          <p className="hint">等管理者建立學期與科目之後，作業就會出現在這裡。</p>
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
      <h1>總覽</h1>

      {curriculumError ? <p className="error">▲ {curriculumError}</p> : null}
      {error ? <p className="error">▲ {error}</p> : null}

      <p className="hint">
        7 天內 · {upcoming.length} 件
        {filtered ? '（只顯示我修的科目）' : ''}
      </p>

      {rows === null ? <p className="hint">載入中…</p> : null}

      {overdue.length > 0 ? (
        <>
          <h2>已逾期</h2>
          <ul className="card-list">
            {overdue.map((item) => (
              <HomeworkCard key={item.id} item={item} subjects={subjects} now={now} overdue />
            ))}
          </ul>
        </>
      ) : null}

      <h2>7 天內</h2>
      {rows !== null && upcoming.length === 0 ? (
        <p className="hint">這七天沒有要交的作業。</p>
      ) : null}
      <ul className="card-list">
        {upcoming.map((item) => (
          <HomeworkCard key={item.id} item={item} subjects={subjects} now={now} />
        ))}
      </ul>

      <p className="hint">
        看全部的作業去<Link to="/app/homework">作業</Link>頁。
      </p>
    </section>
  );
}

export function HomeworkCard({
  item,
  subjects,
  now,
  overdue = false,
}: {
  item: ItemRow;
  subjects: Map<string, SubjectRow>;
  now: number;
  overdue?: boolean;
}) {
  return (
    <li className="card card-stack">
      <div className="card-main">
        <SubjectChip subject={subjects.get(item.subId)} />
        <strong>{item.title}</strong>
      </div>
      <div className="card-actions">
        {item.dueAt !== null ? <span className="tag">{formatDueAt(item.dueAt)}</span> : null}
        {item.dueAt !== null ? (
          // 逾期＝紅框 + 斜線底紋 + ▲，三重編碼，不只靠顏色。
          <span className={overdue ? 'missing' : 'tag'}>
            {describeDue(item.dueAt, new Date(now))}
          </span>
        ) : (
          <span className="tag">沒有到期日</span>
        )}
      </div>
    </li>
  );
}
