/**
 * 筆記：關鍵字、檔案、連結，依章節整理。
 *
 * 一次看一個科目。這一頁只讀單一科目底下的 items，用的是
 * deletedAt 的單一欄位索引，不必動到複合索引。
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { ItemType } from '@jindu/shared';

import MathText from '../components/MathText';
import { SubjectFilter } from '../components/SubjectChip';
import { buildTree, watchChapters, type ChapterRow } from '../lib/chapters';
import { formatBytes } from '../lib/format';
import { useGroups } from '../lib/groupContext';
import { fileUrl, watchItems, type ItemRow } from '../lib/items';
import { useCurriculum } from '../lib/useCurriculum';

const NOTE_TYPES: ItemType[] = ['keyword', 'file', 'link'];

const TYPE_MARK: Record<string, string> = {
  keyword: '★',
  file: '▣',
  link: '↗',
};

export default function NotesPage() {
  const { activeGid, activeSemesterId, activeGroup } = useGroups();
  const { mine, error: curriculumError } = useCurriculum();

  const [subId, setSubId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[] | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 沒選過就自動選第一個科目，不要讓人看到空畫面還得自己點一下。
  useEffect(() => {
    if (subId === null && mine && mine.length > 0) setSubId(mine[0]?.id ?? null);
  }, [mine, subId]);

  useEffect(() => {
    if (!activeGid || !activeSemesterId || !subId) {
      setItems(null);
      return undefined;
    }
    return watchItems(activeGid, activeSemesterId, subId, setItems, (err) =>
      setError(err.message),
    );
  }, [activeGid, activeSemesterId, subId]);

  useEffect(() => {
    if (!activeGid || !activeSemesterId || !subId) return undefined;
    return watchChapters(activeGid, activeSemesterId, subId, setChapters, (err) =>
      setError(err.message),
    );
  }, [activeGid, activeSemesterId, subId]);

  const tree = useMemo(() => buildTree(chapters), [chapters]);

  const notes = useMemo(
    () => (items ?? []).filter((item) => NOTE_TYPES.includes(item.type)),
    [items],
  );

  /** 依章節分組：樹狀順序，最後補一組「沒掛章節」。 */
  const sections = useMemo(() => {
    const flat: { id: string | null; label: string }[] = [];
    for (const chapter of tree) {
      flat.push({
        id: chapter.id,
        label: chapter.number ? `${chapter.number} ${chapter.title}` : chapter.title,
      });
      for (const section of chapter.sections) {
        flat.push({
          id: section.id,
          label: section.number ? `${section.number} ${section.title}` : section.title,
        });
      }
    }
    flat.push({ id: null, label: '沒掛章節' });

    return flat
      .map((entry) => ({
        ...entry,
        items: notes.filter((item) => item.chapterId === entry.id),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [tree, notes]);

  async function open(item: ItemRow) {
    if (!item.storagePath) return;
    try {
      const url = await fileUrl(item.storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!activeSemesterId) {
    return (
      <section>
        <h1>筆記</h1>
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
      <h1>筆記</h1>

      {curriculumError ? <p className="error">▲ {curriculumError}</p> : null}
      {error ? <p className="error">▲ {error}</p> : null}

      <SubjectFilter subjects={mine ?? []} value={subId} onChange={setSubId} allowAll={false} />

      {mine !== null && mine.length === 0 ? <p className="hint">這個學期還沒有科目。</p> : null}
      {items === null && subId ? <p className="hint">載入中…</p> : null}
      {items !== null && notes.length === 0 ? (
        <p className="hint">這個科目還沒有關鍵字、檔案或連結。</p>
      ) : null}

      {sections.map((section) => (
        <div key={section.id ?? '__none'}>
          <h2>{section.label}</h2>
          <ul className="card-list">
            {section.items.map((item) => (
              <li key={item.id} className="card card-stack">
                <div className="card-main">
                  <span className="tag" aria-hidden="true">
                    {TYPE_MARK[item.type]}
                  </span>
                  <strong>{item.title}</strong>

                  {item.type === 'file' ? (
                    <span className="tag">
                      {formatBytes(item.sizeBytes ?? 0)} · {item.contentType ?? '未知'}
                    </span>
                  ) : null}

                  {item.type === 'keyword' && item.body ? (
                    <div className="item-body">
                      <MathText text={item.body} />
                    </div>
                  ) : null}
                </div>

                <div className="card-actions">
                  {item.type === 'link' && item.url ? (
                    <a
                      className="btn btn-small"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      開啟
                    </a>
                  ) : null}
                  {item.type === 'file' ? (
                    <button type="button" className="btn btn-small" onClick={() => void open(item)}>
                      下載
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
