/**
 * 我修的科目。
 *
 * 只寫自己的 groups/{gid}/members/{uid}.enrolledSubjectIds——規則只讓本人寫，
 * 連管理者都不能改別人的。加入群組後選一次，之後隨時可以回來調。
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { describeSchedule } from '../components/ScheduleEditor';
import { useAuth } from '../lib/auth';
import { setEnrolledSubjects, watchMyMember, type MyMember } from '../lib/enrollment';
import { useGroups } from '../lib/groupContext';
import { watchSubjects, type SubjectRow } from '../lib/subjects';

export default function EnrollmentPage() {
  const { user } = useAuth();
  const { activeGid, activeSemesterId, activeSemester } = useGroups();

  const [subjects, setSubjects] = useState<SubjectRow[] | null>(null);
  const [member, setMember] = useState<MyMember | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!activeGid || !activeSemesterId) return undefined;
    return watchSubjects(activeGid, activeSemesterId, setSubjects, (err) => setError(err.message));
  }, [activeGid, activeSemesterId]);

  useEffect(() => {
    if (!activeGid || !uid) return undefined;
    return watchMyMember(
      activeGid,
      uid,
      (row) => {
        setMember(row);
        // 只在還沒動過的時候跟著伺服器走，避免打斷正在勾選的人。
        setSelected((current) => current ?? row?.enrolledSubjectIds ?? []);
      },
      (err) => setError(err.message),
    );
  }, [activeGid, uid]);

  if (!activeGid) return <p className="hint">請先選一個群組。</p>;

  if (!activeSemesterId) {
    return (
      <section>
        <h1>我修的科目</h1>
        <div className="panel">
          <h2>還沒有目前學期</h2>
          <p className="hint">等管理者建立學期與科目之後再回來選。</p>
          <Link className="btn" to="/app/settings">
            回設定
          </Link>
        </div>
      </section>
    );
  }

  function toggle(id: string) {
    setSaved(false);
    setSelected((current) => {
      const list = current ?? [];
      return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    });
  }

  async function save() {
    if (!uid || selected === null) return;
    setBusy(true);
    setError(null);
    try {
      await setEnrolledSubjects(activeGid!, uid, selected);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const dirty =
    selected !== null &&
    member !== null &&
    (selected.length !== member.enrolledSubjectIds.length ||
      selected.some((id) => !member.enrolledSubjectIds.includes(id)));

  return (
    <section>
      <p className="eyebrow">
        <Link to="/app/settings">← 設定</Link>
      </p>
      <h1>我修的科目</h1>
      <p className="hint">
        {activeSemester ? `${activeSemester.name} 學期・` : ''}
        勾選你這學期修的科目。總覽與各列表只會顯示勾選的科目。
      </p>

      {error ? <p className="error">▲ {error}</p> : null}
      {saved && !dirty ? <p className="hint">✓ 已儲存</p> : null}

      {member === null ? (
        <p className="hint">找不到你的成員資料。重新進一次群組應該就會補上。</p>
      ) : null}

      {subjects === null ? <p className="hint">載入中…</p> : null}

      {subjects !== null && subjects.length === 0 ? (
        <p className="hint">這個學期還沒有科目。</p>
      ) : null}

      <ul className="card-list">
        {(subjects ?? []).map((subject) => {
          const on = selected?.includes(subject.id) ?? false;
          return (
            <li key={subject.id} className={on ? 'card card-active' : 'card'}>
              <label className="enroll-row">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(subject.id)}
                  disabled={busy || member === null}
                />
                <span
                  className="subject-chip"
                  style={{ ['--subject-color' as string]: `var(--subject-${subject.colorIndex})` }}
                >
                  {subject.shortName}
                </span>
                <span className="enroll-name">
                  <strong>{subject.name}</strong>
                  <span className="hint">{describeSchedule(subject.schedule)}</span>
                </span>
                {/* 勾選狀態除了核取方塊，再加一個文字標記。 */}
                <span className="tag">{on ? '✓ 有修' : '沒修'}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="choices">
        <button type="button" className="btn" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? '儲存中…' : dirty ? '儲存' : '沒有變更'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !dirty}
          onClick={() => setSelected(member?.enrolledSubjectIds ?? [])}
        >
          還原
        </button>
      </div>

      <p className="hint">
        一個都沒勾＝還沒選過，這時列表會顯示全部科目，不會給你一個空白畫面。
      </p>
    </section>
  );
}
