/**
 * 章節樹：新增、改名、排序、軟刪除，以及設定目前進度。
 *
 * 固定兩層（章／小節）。三層以上的編號在解析時就被壓成 "1-1-2" 這種小節編號，
 * 不會再長一層，所以這裡只需要處理 parentId 是 null 或不是 null 兩種情況。
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import ConfirmButton from '../components/ConfirmButton';
import { useGroups } from '../lib/groupContext';
import {
  buildTree,
  createChapter,
  moveChapter,
  renameChapter,
  softDeleteChapter,
  watchChapters,
  type ChapterRow,
} from '../lib/chapters';
import { setCurrentChapter, watchSubjects, type SubjectRow } from '../lib/subjects';

export default function ChaptersPage() {
  const { subId = '' } = useParams();
  const { activeGid, activeSemesterId, isManager } = useGroups();

  const [rows, setRows] = useState<ChapterRow[] | null>(null);
  const [subjects, setSubjects] = useState<SubjectRow[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNumber, setDraftNumber] = useState('');
  const [addingTo, setAddingTo] = useState<string | null | 'root'>(null);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGid || !activeSemesterId || !subId) return undefined;
    return watchChapters(activeGid, activeSemesterId, subId, setRows, (err) =>
      setError(err.message),
    );
  }, [activeGid, activeSemesterId, subId]);

  useEffect(() => {
    if (!activeGid || !activeSemesterId) return undefined;
    return watchSubjects(activeGid, activeSemesterId, setSubjects, (err) => setError(err.message));
  }, [activeGid, activeSemesterId]);

  const subject = subjects?.find((s) => s.id === subId) ?? null;
  const tree = useMemo(() => buildTree(rows ?? []), [rows]);

  if (!activeGid || !activeSemesterId) return <p className="hint">請先選一個群組與學期。</p>;

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

  function startEdit(row: ChapterRow) {
    setEditing(row.id);
    setDraftTitle(row.title);
    setDraftNumber(row.number ?? '');
  }

  async function saveEdit(chapId: string) {
    await run(async () => {
      await renameChapter(activeGid!, activeSemesterId!, subId, chapId, {
        title: draftTitle,
        number: draftNumber.trim() === '' ? null : draftNumber.trim(),
      });
      setEditing(null);
    });
  }

  async function addChapter(parentId: string | null) {
    const title = newTitle.trim();
    if (title === '') return;
    await run(async () => {
      const siblings = (rows ?? []).filter((row) => row.parentId === parentId);
      await createChapter(
        activeGid!,
        activeSemesterId!,
        subId,
        { title, number: null, parentId },
        siblings,
      );
      setNewTitle('');
      setAddingTo(null);
    });
  }

  function renderRow(row: ChapterRow, siblings: ChapterRow[], isSection: boolean) {
    const index = siblings.findIndex((s) => s.id === row.id);
    const isCurrent = subject?.currentChapterId === row.id;

    if (editing === row.id) {
      return (
        <div className="panel">
          <label className="field">
            <span>編號（可留空）</span>
            <input value={draftNumber} onChange={(e) => setDraftNumber(e.target.value)} />
          </label>
          <label className="field">
            <span>標題</span>
            <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
          </label>
          <div className="choices">
            <button
              type="button"
              className="btn btn-small"
              disabled={busy}
              onClick={() => void saveEdit(row.id)}
            >
              儲存
            </button>
            <button type="button" className="btn btn-small" onClick={() => setEditing(null)}>
              取消
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={isCurrent ? 'card card-active card-stack' : 'card card-stack'}>
        <div className="card-main">
          {row.number ? <span className="tag">{row.number}</span> : null}
          <strong>{row.title || '（未命名）'}</strong>
          {isCurrent ? <span className="tag tag-active">▶ 目前進度</span> : null}
        </div>

        {isManager ? (
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-small"
              disabled={busy || index === 0}
              aria-label={`把 ${row.title} 往上移`}
              onClick={() =>
                void run(() =>
                  moveChapter(activeGid!, activeSemesterId!, subId, rows ?? [], row.id, -1),
                )
              }
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-small"
              disabled={busy || index === siblings.length - 1}
              aria-label={`把 ${row.title} 往下移`}
              onClick={() =>
                void run(() =>
                  moveChapter(activeGid!, activeSemesterId!, subId, rows ?? [], row.id, 1),
                )
              }
            >
              ↓
            </button>
            {isSection ? null : (
              <button
                type="button"
                className="btn btn-small"
                disabled={busy}
                onClick={() => setAddingTo(row.id)}
              >
                ＋小節
              </button>
            )}
            <button
              type="button"
              className="btn btn-small"
              disabled={busy}
              onClick={() => startEdit(row)}
            >
              改名
            </button>
            <button
              type="button"
              className="btn btn-small"
              disabled={busy || isCurrent}
              onClick={() =>
                void run(() => setCurrentChapter(activeGid!, activeSemesterId!, subId, row.id))
              }
            >
              設為進度
            </button>
            <ConfirmButton
              label="刪除"
              confirmLabel={isSection ? '確定刪除' : '確定刪除整章'}
              disabled={busy}
              onConfirm={() =>
                void run(() =>
                  softDeleteChapter(activeGid!, activeSemesterId!, subId, row.id, rows ?? []),
                )
              }
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section>
      <p className="eyebrow">
        <Link to="/app/settings/subjects">← 科目</Link>
      </p>
      <h1>章節</h1>
      <p className="hint">
        {subject ? `${subject.name}（${subject.shortName}）` : '載入中…'} · 固定兩層：章與小節
      </p>

      {error ? <p className="error">▲ {error}</p> : null}

      {rows === null ? <p className="hint">載入中…</p> : null}

      {rows !== null && tree.length === 0 ? (
        <p className="hint">還沒有章節。可以一個一個加，或走開學設定精靈貼上整份目錄。</p>
      ) : null}

      <ul className="tree">
        {tree.map((chapter) => (
          <li key={chapter.id}>
            {renderRow(chapter, tree, false)}

            <ul className="tree tree-sections">
              {chapter.sections.map((section) => (
                <li key={section.id}>{renderRow(section, chapter.sections, true)}</li>
              ))}
            </ul>

            {addingTo === chapter.id ? (
              <div className="panel">
                <label className="field">
                  <span>新小節的標題</span>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    autoFocus
                  />
                </label>
                <div className="choices">
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busy || newTitle.trim() === ''}
                    onClick={() => void addChapter(chapter.id)}
                  >
                    新增
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setAddingTo(null)}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {isManager ? (
        addingTo === 'root' ? (
          <div className="panel">
            <label className="field">
              <span>新章的標題</span>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus />
            </label>
            <div className="choices">
              <button
                type="button"
                className="btn btn-small"
                disabled={busy || newTitle.trim() === ''}
                onClick={() => void addChapter(null)}
              >
                新增
              </button>
              <button type="button" className="btn btn-small" onClick={() => setAddingTo(null)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setAddingTo('root')}>
            ＋ 新增章
          </button>
        )
      ) : (
        <p className="hint">只有擁有者與管理者可以編輯章節。</p>
      )}
    </section>
  );
}
