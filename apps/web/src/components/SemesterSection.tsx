/**
 * 學期管理：建立、改名、切換目前學期、軟刪除。
 *
 * 「目前學期」是 groups/{gid}.activeSemesterId，所以切換學期其實是改群組文件，
 * 需要管理者權限。
 */

import { useState } from 'react';

import { toDateKey } from '@jindu/shared';
import ConfirmButton from './ConfirmButton';
import { useGroups } from '../lib/groupContext';
import {
  createSemester,
  setActiveSemester,
  softDeleteSemester,
  updateSemester,
} from '../lib/semesters';

/** 預設起訖日：今天起算的一個學期，大約 18 週。 */
function defaultDates(): { startDate: string; endDate: string } {
  const now = new Date();
  const start = toDateKey(now);
  const end = toDateKey(new Date(now.getTime() + 18 * 7 * 24 * 60 * 60 * 1000));
  return { startDate: start, endDate: end };
}

export default function SemesterSection() {
  const { activeGid, semesters, activeSemesterId, isManager } = useGroups();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [dates, setDates] = useState(defaultDates);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!activeGid) return null;

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

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() === '') return;
    await run(async () => {
      const semId = await createSemester(activeGid!, { name, ...dates });
      // 第一個學期直接設成目前學期，省一次點擊。
      if (!activeSemesterId) await setActiveSemester(activeGid!, semId);
      setName('');
      setDates(defaultDates());
      setAdding(false);
    });
  }

  return (
    <>
      <h2>學期</h2>
      {error ? <p className="error">▲ {error}</p> : null}

      {semesters === null ? <p className="hint">載入中…</p> : null}

      {semesters !== null && semesters.length === 0 ? (
        <p className="hint">還沒有學期。科目與章節都掛在學期底下，先建一個。</p>
      ) : null}

      {semesters !== null && semesters.length > 0 ? (
        <ul className="card-list">
          {semesters.map((semester) => {
            const active = semester.id === activeSemesterId;
            return (
              <li
                key={semester.id}
                className={active ? 'card card-active card-stack' : 'card card-stack'}
              >
                {editing === semester.id ? (
                  <div className="card-main">
                    <label className="field">
                      <span>學期名稱</span>
                      <input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                    </label>
                    <div className="choices">
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await updateSemester(activeGid!, semester.id, { name: draftName });
                            setEditing(null);
                          })
                        }
                      >
                        儲存
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => setEditing(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="card-main">
                      <strong>{semester.name}</strong>
                      <span className="tag">
                        {semester.startDate} – {semester.endDate}
                      </span>
                      {active ? <span className="tag tag-active">● 目前</span> : null}
                    </div>

                    {isManager ? (
                      <div className="card-actions">
                        {active ? null : (
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={busy}
                            onClick={() => void run(() => setActiveSemester(activeGid!, semester.id))}
                          >
                            設為目前
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-small"
                          disabled={busy}
                          onClick={() => {
                            setEditing(semester.id);
                            setDraftName(semester.name);
                          }}
                        >
                          改名
                        </button>
                        <ConfirmButton
                          label="刪除"
                          confirmLabel="確定刪除"
                          disabled={busy}
                          onConfirm={() =>
                            void run(async () => {
                              await softDeleteSemester(activeGid!, semester.id);
                              if (active) await setActiveSemester(activeGid!, null);
                            })
                          }
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!isManager ? (
        <p className="hint">只有擁有者與管理者可以建立或切換學期。</p>
      ) : adding ? (
        <form className="panel" onSubmit={handleCreate}>
          <h3>新增學期</h3>
          <label className="field">
            <span>名稱</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：115-1"
              maxLength={20}
              required
            />
          </label>
          <label className="field">
            <span>開始日</span>
            <input
              type="date"
              value={dates.startDate}
              onChange={(e) => setDates({ ...dates, startDate: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>結束日</span>
            <input
              type="date"
              value={dates.endDate}
              onChange={(e) => setDates({ ...dates, endDate: e.target.value })}
              required
            />
          </label>
          <div className="choices">
            <button type="submit" className="btn" disabled={busy || name.trim() === ''}>
              {busy ? '建立中…' : '建立'}
            </button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              取消
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          ＋ 新增學期
        </button>
      )}
    </>
  );
}
