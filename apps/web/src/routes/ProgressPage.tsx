/**
 * 進度：章節樹 + 目前進度 + 缺重點標示。
 *
 * 缺重點的定義（決策：2026-09-22）：該章節底下沒有任何 type === 'keyword'
 * 的未刪除項目。章要連它的小節都沒有才算缺。計算在 @jindu/shared 的
 * progress.ts，有 25 個測試。
 *
 * 標示方式：紅框 + 斜線底紋 + ▲ 三重編碼，不只靠顏色。
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { chapterStates, chaptersMissingKeyPoints, type ChapterState } from '@jindu/shared';

import { SubjectFilter } from '../components/SubjectChip';
import { buildTree, watchChapters, type ChapterRow } from '../lib/chapters';
import { useGroups } from '../lib/groupContext';
import { watchItems, type ItemRow } from '../lib/items';
import { useCurriculum } from '../lib/useCurriculum';

const STATE_LABEL: Record<ChapterState, string> = {
  done: '✓ 完成',
  current: '▶ 目前',
  todo: '未開始',
};

export default function ProgressPage() {
  const { activeGid, activeSemesterId, activeGroup } = useGroups();
  const { mine, error: curriculumError } = useCurriculum();

  const [subId, setSubId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [items, setItems] = useState<ItemRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subId === null && mine && mine.length > 0) setSubId(mine[0]?.id ?? null);
  }, [mine, subId]);

  useEffect(() => {
    if (!activeGid || !activeSemesterId || !subId) {
      setChapters([]);
      return undefined;
    }
    return watchChapters(activeGid, activeSemesterId, subId, setChapters, (err) =>
      setError(err.message),
    );
  }, [activeGid, activeSemesterId, subId]);

  useEffect(() => {
    if (!activeGid || !activeSemesterId || !subId) {
      setItems(null);
      return undefined;
    }
    return watchItems(activeGid, activeSemesterId, subId, setItems, (err) =>
      setError(err.message),
    );
  }, [activeGid, activeSemesterId, subId]);

  const subject = mine?.find((s) => s.id === subId) ?? null;
  const tree = useMemo(() => buildTree(chapters), [chapters]);
  const states = useMemo(
    () => chapterStates(chapters, subject?.currentChapterId ?? null),
    [chapters, subject],
  );
  const missing = useMemo(
    () => new Set(chaptersMissingKeyPoints(chapters, items ?? [])),
    [chapters, items],
  );

  if (!activeSemesterId) {
    return (
      <section>
        <h1>進度</h1>
        <div className="panel">
          <h2>還沒有目前學期</h2>
          <Link className="btn" to="/app/settings">
            去設定
          </Link>
        </div>
      </section>
    );
  }

  function renderNode(row: ChapterRow) {
    const state = states[row.id] ?? 'todo';
    const isMissing = missing.has(row.id);
    return (
      <div className={isMissing ? 'card card-stack missing' : 'card card-stack'}>
        <div className="card-main">
          {row.number ? <span className="tag">{row.number}</span> : null}
          <strong>{row.title || '（未命名）'}</strong>
        </div>
        <div className="card-actions">
          <span className={state === 'current' ? 'tag tag-active' : 'tag'}>
            {STATE_LABEL[state]}
          </span>
          {isMissing ? (
            <span className="tag tag-danger">▲ 缺重點</span>
          ) : (
            <span className="tag">
              ★ {(items ?? []).filter((i) => i.type === 'keyword' && i.chapterId === row.id).length}
            </span>
          )}
        </div>
      </div>
    );
  }

  const missingCount = missing.size;

  return (
    <section>
      <p className="eyebrow">{activeGroup?.groupName ?? ''}</p>
      <h1>進度</h1>

      {curriculumError ? <p className="error">▲ {curriculumError}</p> : null}
      {error ? <p className="error">▲ {error}</p> : null}

      <SubjectFilter subjects={mine ?? []} value={subId} onChange={setSubId} allowAll={false} />

      {mine !== null && mine.length === 0 ? <p className="hint">這個學期還沒有科目。</p> : null}

      {subject ? (
        <p className="hint">
          {subject.name} · 共 {chapters.length} 個節點
          {missingCount > 0 ? ` · ${missingCount} 個缺重點` : ' · 重點都補齊了'}
        </p>
      ) : null}

      {subId && tree.length === 0 ? (
        <p className="hint">這個科目還沒有章節。管理者可以在設定裡貼上目錄建立。</p>
      ) : null}

      <ul className="tree">
        {tree.map((chapter) => (
          <li key={chapter.id}>
            {renderNode(chapter)}
            {chapter.sections.length > 0 ? (
              <ul className="tree tree-sections">
                {chapter.sections.map((section) => (
                  <li key={section.id}>{renderNode(section)}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      {missingCount > 0 ? (
        <p className="hint">
          ▲ 缺重點＝那個章節底下一個關鍵字都沒有。章要連它的小節都沒有才算缺。
        </p>
      ) : null}
    </section>
  );
}
