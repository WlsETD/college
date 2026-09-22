/**
 * 科目管理：建立、編輯、排序、軟刪除，以及進入章節樹。
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import ConfirmButton from '../components/ConfirmButton';
import SubjectForm from '../components/SubjectForm';
import { describeSchedule } from '../components/ScheduleEditor';
import { useGroups } from '../lib/groupContext';
import {
  createSubject,
  moveSubject,
  softDeleteSubject,
  updateSubject,
  watchSubjects,
  type SubjectInput,
  type SubjectRow,
} from '../lib/subjects';

export default function SubjectsPage() {
  const { activeGid, activeSemesterId, activeSemester, isManager } = useGroups();
  const [subjects, setSubjects] = useState<SubjectRow[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGid || !activeSemesterId) {
      setSubjects(null);
      return undefined;
    }
    return watchSubjects(activeGid, activeSemesterId, setSubjects, (err) => setError(err.message));
  }, [activeGid, activeSemesterId]);

  if (!activeGid) return <p className="hint">請先選一個群組。</p>;

  if (!activeSemesterId) {
    return (
      <section>
        <h1>科目</h1>
        <div className="panel">
          <h2>還沒有目前學期</h2>
          <p className="hint">科目掛在學期底下，要先建立並選定一個學期。</p>
          <Link className="btn" to="/app/settings">
            去設定學期
          </Link>
        </div>
      </section>
    );
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(input: SubjectInput) {
    await run(async () => {
      await createSubject(activeGid!, activeSemesterId!, input, subjects ?? []);
      setAdding(false);
    });
  }

  async function handleUpdate(subId: string, input: SubjectInput) {
    await run(async () => {
      await updateSubject(activeGid!, activeSemesterId!, subId, input);
      setEditing(null);
    });
  }

  return (
    <section>
      <p className="eyebrow">
        <Link to="/app/settings">← 設定</Link>
      </p>
      <h1>科目</h1>
      <p className="hint">{activeSemester ? `${activeSemester.name} 學期` : '目前學期'}</p>

      {error ? <p className="error">▲ {error}</p> : null}

      {subjects === null ? <p className="hint">載入中…</p> : null}

      {subjects !== null && subjects.length === 0 ? (
        <p className="hint">還沒有科目。用下面的按鈕新增，或走一次開學設定精靈。</p>
      ) : null}

      {subjects !== null && subjects.length > 0 ? (
        <ul className="card-list">
          {subjects.map((subject, index) =>
            editing === subject.id ? (
              <li key={subject.id}>
                <SubjectForm
                  initial={subject}
                  submitLabel="儲存"
                  busy={busy}
                  onSubmit={(input) => handleUpdate(subject.id, input)}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={subject.id} className="card card-stack">
                <div className="card-main">
                  <span
                    className="subject-chip"
                    style={{ ['--subject-color' as string]: `var(--subject-${subject.colorIndex})` }}
                  >
                    {subject.shortName}
                  </span>
                  <strong>{subject.name}</strong>
                  <span className="tag">{describeSchedule(subject.schedule)}</span>
                </div>

                {isManager ? (
                  <div className="card-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy || index === 0}
                      aria-label={`把 ${subject.name} 往上移`}
                      onClick={() =>
                        void run(() =>
                          moveSubject(activeGid!, activeSemesterId!, subjects, subject.id, -1),
                        )
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy || index === subjects.length - 1}
                      aria-label={`把 ${subject.name} 往下移`}
                      onClick={() =>
                        void run(() =>
                          moveSubject(activeGid!, activeSemesterId!, subjects, subject.id, 1),
                        )
                      }
                    >
                      ↓
                    </button>
                    <Link className="btn btn-small" to={`/app/settings/subjects/${subject.id}`}>
                      章節
                    </Link>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy}
                      onClick={() => setEditing(subject.id)}
                    >
                      編輯
                    </button>
                    <ConfirmButton
                      label="刪除"
                      confirmLabel="確定刪除"
                      disabled={busy}
                      onConfirm={() =>
                        void run(() => softDeleteSubject(activeGid!, activeSemesterId!, subject.id))
                      }
                    />
                  </div>
                ) : (
                  <div className="card-actions">
                    <Link className="btn btn-small" to={`/app/settings/subjects/${subject.id}`}>
                      章節
                    </Link>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      ) : null}

      {isManager ? (
        adding ? (
          <SubjectForm
            submitLabel="新增"
            busy={busy}
            onSubmit={handleCreate}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            ＋ 新增科目
          </button>
        )
      ) : (
        <p className="hint">只有擁有者與管理者可以新增或修改科目。</p>
      )}
    </section>
  );
}
