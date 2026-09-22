/**
 * 某個科目的內容項目：作業、關鍵字、檔案、連結。
 *
 * 四型共用一個集合，這一頁負責新增與刪除；真正的呈現（總覽／作業／筆記／進度）
 * 在步驟 8。項目可以掛在章節底下，之後進度頁的「缺重點」就是看某個章節底下
 * 有沒有 type === 'keyword' 的未刪除項目。
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { ItemType } from '@jindu/shared';
import ConfirmButton from '../components/ConfirmButton';
import MathText from '../components/MathText';
import {
  FileForm,
  HomeworkForm,
  KeywordBatchForm,
  KeywordForm,
  LinkForm,
} from '../components/ItemForms';
import { useAuth } from '../lib/auth';
import { buildTree, watchChapters, type ChapterRow } from '../lib/chapters';
import { formatBytes, formatDueAt, describeDue } from '../lib/format';
import { useGroups } from '../lib/groupContext';
import {
  ITEM_TYPE_LABEL,
  createFileItem,
  createHomework,
  createKeyword,
  createKeywordsFromText,
  createLink,
  fileUrl,
  softDeleteItem,
  watchItems,
  type ItemContext,
  type ItemRow,
} from '../lib/items';
import { watchSubjects, type SubjectRow } from '../lib/subjects';

type FormKind = ItemType | 'keyword-batch' | null;

const TABS: { type: ItemType; label: string }[] = [
  { type: 'homework', label: '作業' },
  { type: 'keyword', label: '關鍵字' },
  { type: 'file', label: '檔案' },
  { type: 'link', label: '連結' },
];

export default function ItemsPage() {
  const { subId = '' } = useParams();
  const { user } = useAuth();
  const { activeGid, activeSemesterId, isManager } = useGroups();

  const [items, setItems] = useState<ItemRow[] | null>(null);
  const [subjects, setSubjects] = useState<SubjectRow[] | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [tab, setTab] = useState<ItemType>('homework');
  const [form, setForm] = useState<FormKind>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!activeGid || !activeSemesterId || !subId) return undefined;
    return watchItems(activeGid, activeSemesterId, subId, setItems, (err) =>
      setError(err.message),
    );
  }, [activeGid, activeSemesterId, subId]);

  useEffect(() => {
    if (!activeGid || !activeSemesterId) return undefined;
    return watchSubjects(activeGid, activeSemesterId, setSubjects, (err) => setError(err.message));
  }, [activeGid, activeSemesterId]);

  useEffect(() => {
    if (!activeGid || !activeSemesterId || !subId) return undefined;
    return watchChapters(activeGid, activeSemesterId, subId, setChapters, (err) =>
      setError(err.message),
    );
  }, [activeGid, activeSemesterId, subId]);

  const subject = subjects?.find((s) => s.id === subId) ?? null;
  const tree = useMemo(() => buildTree(chapters), [chapters]);
  const chapterLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of chapters) {
      map.set(row.id, row.number ? `${row.number} ${row.title}` : row.title);
    }
    return map;
  }, [chapters]);

  const shown = useMemo(() => {
    const filtered = (items ?? []).filter((item) => item.type === tab);
    if (tab !== 'homework') return filtered;
    // 作業依到期日排，沒有到期日的排最後。
    return [...filtered].sort(
      (a, b) => (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY),
    );
  }, [items, tab]);

  if (!activeGid || !activeSemesterId) return <p className="hint">請先選一個群組與學期。</p>;

  const ctx: ItemContext = {
    gid: activeGid,
    semId: activeSemesterId,
    subId,
    uid: user?.uid ?? '',
    chapterId,
  };

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

  function done(message: string) {
    setForm(null);
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  }

  async function openFile(item: ItemRow) {
    if (!item.storagePath) return;
    await run(async () => {
      const url = await fileUrl(item.storagePath as string);
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  return (
    <section>
      <p className="eyebrow">
        <Link to="/app/settings/subjects">← 科目</Link>
      </p>
      <h1>內容</h1>
      <p className="hint">{subject ? `${subject.name}（${subject.shortName}）` : '載入中…'}</p>

      {error ? <p className="error">▲ {error}</p> : null}
      {notice ? <p className="hint">✓ {notice}</p> : null}

      {/* 四型的分頁：文字 + 底線，不只靠顏色。 */}
      <div className="type-tabs" role="tablist" aria-label="內容項目類型">
        {TABS.map((item) => (
          <button
            key={item.type}
            type="button"
            role="tab"
            aria-selected={tab === item.type}
            className={tab === item.type ? 'type-tab type-tab-on' : 'type-tab'}
            onClick={() => {
              setTab(item.type);
              setForm(null);
            }}
          >
            {item.label}
            <span className="tag">
              {(items ?? []).filter((i) => i.type === item.type).length}
            </span>
          </button>
        ))}
      </div>

      {isManager ? (
        <>
          <label className="field">
            <span>掛在哪個章節（可留空）</span>
            <select
              value={chapterId ?? ''}
              onChange={(e) => setChapterId(e.target.value === '' ? null : e.target.value)}
            >
              <option value="">不掛章節</option>
              {tree.map((chapter) => (
                <optgroup
                  key={chapter.id}
                  label={chapter.number ? `${chapter.number} ${chapter.title}` : chapter.title}
                >
                  <option value={chapter.id}>
                    {chapter.number ? `${chapter.number} ` : ''}
                    {chapter.title}（整章）
                  </option>
                  {chapter.sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.number ? `${section.number} ` : ''}
                      {section.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="choices">
            <button type="button" className="btn" onClick={() => setForm(tab)}>
              ＋ 新增{ITEM_TYPE_LABEL[tab]}
            </button>
            {tab === 'keyword' ? (
              <button type="button" className="btn" onClick={() => setForm('keyword-batch')}>
                批次貼上
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="hint">只有擁有者與管理者可以新增內容。</p>
      )}

      {form === 'homework' ? (
        <HomeworkForm
          schedule={subject?.schedule ?? []}
          busy={busy}
          onCancel={() => setForm(null)}
          onSubmit={(input) =>
            run(async () => {
              await createHomework(ctx, input);
              done('作業已新增');
            })
          }
        />
      ) : null}

      {form === 'keyword' ? (
        <KeywordForm
          busy={busy}
          onCancel={() => setForm(null)}
          onSubmit={(input) =>
            run(async () => {
              await createKeyword(ctx, input);
              done('關鍵字已新增');
            })
          }
        />
      ) : null}

      {form === 'keyword-batch' ? (
        <KeywordBatchForm
          busy={busy}
          onCancel={() => setForm(null)}
          onSubmit={(text) =>
            run(async () => {
              const count = await createKeywordsFromText(ctx, text);
              done(`已新增 ${count} 個關鍵字`);
            })
          }
        />
      ) : null}

      {form === 'link' ? (
        <LinkForm
          busy={busy}
          onCancel={() => setForm(null)}
          onSubmit={(input) =>
            run(async () => {
              await createLink(ctx, input);
              done('連結已新增');
            })
          }
        />
      ) : null}

      {form === 'file' ? (
        <FileForm
          busy={busy}
          onCancel={() => setForm(null)}
          onSubmit={(file, title) =>
            run(async () => {
              await createFileItem(ctx, file, title);
              done('檔案已上傳');
            })
          }
        />
      ) : null}

      {items === null ? <p className="hint">載入中…</p> : null}

      {items !== null && shown.length === 0 ? (
        <p className="hint">這個科目還沒有{ITEM_TYPE_LABEL[tab]}。</p>
      ) : null}

      <ul className="card-list">
        {shown.map((item) => (
          <li key={item.id} className="card card-stack">
            <div className="card-main">
              <strong>{item.title}</strong>

              {item.type === 'homework' && item.dueAt !== null ? (
                <>
                  <span className="tag">{formatDueAt(item.dueAt)}</span>
                  <span className={describeDue(item.dueAt).startsWith('已逾期') ? 'missing' : 'tag'}>
                    {describeDue(item.dueAt)}
                  </span>
                </>
              ) : null}

              {item.type === 'homework' && item.dueAt === null ? (
                <span className="tag">沒有到期日</span>
              ) : null}

              {item.chapterId ? (
                <span className="tag">{chapterLabel.get(item.chapterId) ?? '（章節已刪除）'}</span>
              ) : null}

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
                <a className="btn btn-small" href={item.url} target="_blank" rel="noreferrer noopener">
                  開啟
                </a>
              ) : null}

              {item.type === 'file' ? (
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy}
                  onClick={() => void openFile(item)}
                >
                  下載
                </button>
              ) : null}

              {isManager ? (
                <ConfirmButton
                  label="刪除"
                  confirmLabel="確定刪除"
                  disabled={busy}
                  onConfirm={() =>
                    void run(() => softDeleteItem(activeGid, activeSemesterId, subId, item.id))
                  }
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
