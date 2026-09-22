/**
 * 內容項目的四種新增表單。
 *
 * 四型共用一個 items 集合，差別只在欄位與建立方式：
 *   作業   title + dueAt，到期日有四個快速選項
 *   關鍵字 title + body（支援 LaTeX），可一次貼一整批
 *   檔案   上傳到 Storage，單檔 30 MB、拒絕 video/*
 *   連結   title + url，只接受 http(s)
 */

import { useMemo, useState } from 'react';

import {
  MAX_UPLOAD_BYTES,
  holidayDates,
  nextClassDate,
  nextSameSlotNextWeek,
  normalizeUrl,
  parseKeywords,
  tomorrow,
  type ClassSlot,
} from '@jindu/shared';

import MathText from './MathText';
import { formatBytes, formatDueAt, fromDatetimeLocal, toDatetimeLocal } from '../lib/format';

// -----------------------------------------------------------------------------
// 作業
// -----------------------------------------------------------------------------

export interface HomeworkFormProps {
  schedule: readonly ClassSlot[];
  busy: boolean;
  onSubmit: (input: { title: string; dueAt: number | null }) => void | Promise<void>;
  onCancel: () => void;
}

export function HomeworkForm({ schedule, busy, onSubmit, onCancel }: HomeworkFormProps) {
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);

  // 「下堂課」與「下週同一堂」要跳過假日；「明天」依規格不跳。
  const quickDates = useMemo(() => {
    const now = new Date();
    const holidays = holidayDates();
    const options = { now, schedule, holidays };
    return [
      { label: '下堂課', at: schedule.length > 0 ? nextClassDate(options) : null },
      { label: '下週同一堂', at: schedule.length > 0 ? nextSameSlotNextWeek(options) : null },
      { label: '明天', at: tomorrow(now) },
    ];
  }, [schedule]);

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() === '') return;
        void onSubmit({ title, dueAt });
      }}
    >
      <h3>新增作業</h3>

      <label className="field">
        <span>作業內容</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：習題 3-2 第 1~15 題"
          maxLength={100}
          required
          autoFocus
        />
      </label>

      <p className="field-label">到期時間</p>
      <div className="choices">
        {quickDates.map((choice) => (
          <button
            key={choice.label}
            type="button"
            className={
              !custom && choice.at !== null && dueAt === choice.at.getTime()
                ? 'btn btn-small btn-on'
                : 'btn btn-small'
            }
            disabled={choice.at === null}
            title={choice.at === null ? '這個科目還沒排課' : undefined}
            onClick={() => {
              setCustom(false);
              setDueAt(choice.at?.getTime() ?? null);
            }}
          >
            {choice.label}
          </button>
        ))}
        <button
          type="button"
          className={custom ? 'btn btn-small btn-on' : 'btn btn-small'}
          onClick={() => setCustom(true)}
        >
          自訂
        </button>
        <button
          type="button"
          className={dueAt === null && !custom ? 'btn btn-small btn-on' : 'btn btn-small'}
          onClick={() => {
            setCustom(false);
            setDueAt(null);
          }}
        >
          不設定
        </button>
      </div>

      {custom ? (
        <label className="field">
          <span>自訂到期時間（台北時間）</span>
          <input
            type="datetime-local"
            value={dueAt === null ? '' : toDatetimeLocal(dueAt)}
            onChange={(e) => setDueAt(fromDatetimeLocal(e.target.value))}
          />
        </label>
      ) : null}

      <p className="hint">{dueAt === null ? '沒有到期日' : `到期：${formatDueAt(dueAt)}`}</p>

      <div className="choices">
        <button type="submit" className="btn" disabled={busy || title.trim() === ''}>
          {busy ? '新增中…' : '新增'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// 關鍵字（單筆）
// -----------------------------------------------------------------------------

export interface KeywordFormProps {
  busy: boolean;
  onSubmit: (input: { title: string; body: string }) => void | Promise<void>;
  onCancel: () => void;
}

export function KeywordForm({ busy, onSubmit, onCancel }: KeywordFormProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() === '') return;
        void onSubmit({ title, body });
      }}
    >
      <h3>新增關鍵字</h3>

      <label className="field">
        <span>關鍵字</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          required
          autoFocus
        />
      </label>

      <label className="field">
        <span>說明（支援 LaTeX，用 $…$ 或 $$…$$ 包起來）</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
      </label>

      {body.trim() !== '' ? (
        <div className="panel">
          <h3>預覽</h3>
          <MathText text={body} />
        </div>
      ) : null}

      <div className="choices">
        <button type="submit" className="btn" disabled={busy || title.trim() === ''}>
          {busy ? '新增中…' : '新增'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// 關鍵字（批次貼上）
// -----------------------------------------------------------------------------

export interface KeywordBatchFormProps {
  busy: boolean;
  onSubmit: (text: string) => void | Promise<void>;
  onCancel: () => void;
}

export function KeywordBatchForm({ busy, onSubmit, onCancel }: KeywordBatchFormProps) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseKeywords(text), [text]);

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed.length === 0) return;
        void onSubmit(text);
      }}
    >
      <h3>批次貼上關鍵字</h3>
      <p className="hint">
        一行一個。第一個分隔符號之後是說明，分隔符號可以用 ｜ | Tab 或 、。
        後面再出現的分隔符號會留在說明裡，所以 $\left| x \right|$ 這種寫法不會被切壞。
      </p>

      <label className="field">
        <span>貼上內容</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={'極限｜函數在某點附近的趨近值\n導數、$f\'(x)=\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}$'}
          autoFocus
        />
      </label>

      <div className="panel">
        <h3>預覽</h3>
        {parsed.length === 0 ? (
          <p className="hint">還沒有解析到任何關鍵字。</p>
        ) : (
          <>
            <p className="hint">會新增 {parsed.length} 個關鍵字。</p>
            <ul className="card-list">
              {parsed.map((keyword, index) => (
                // 同一批可能有重複的字詞，index 才是穩定的身分。
                // eslint-disable-next-line react/no-array-index-key
                <li key={index} className="card card-stack">
                  <div className="card-main">
                    <strong>{keyword.term}</strong>
                    {keyword.description ? <MathText text={keyword.description} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="choices">
        <button type="submit" className="btn" disabled={busy || parsed.length === 0}>
          {busy ? '新增中…' : `新增 ${parsed.length} 個`}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// 連結
// -----------------------------------------------------------------------------

export interface LinkFormProps {
  busy: boolean;
  onSubmit: (input: { title: string; url: string }) => void | Promise<void>;
  onCancel: () => void;
}

export function LinkForm({ busy, onSubmit, onCancel }: LinkFormProps) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const normalized = normalizeUrl(url);
  const invalid = url.trim() !== '' && normalized === null;

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (!normalized) return;
        void onSubmit({ title, url });
      }}
    >
      <h3>新增連結</h3>

      <label className="field">
        <span>標題（留空就用網址）</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
      </label>

      <label className="field">
        <span>網址</span>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="example.com/notes"
          required
          autoFocus
        />
      </label>

      {invalid ? <p className="error">▲ 只接受 http 或 https 的網址</p> : null}
      {normalized ? <p className="hint">會存成：{normalized}</p> : null}

      <div className="choices">
        <button type="submit" className="btn" disabled={busy || !normalized}>
          {busy ? '新增中…' : '新增'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// 檔案
// -----------------------------------------------------------------------------

export interface FileFormProps {
  busy: boolean;
  onSubmit: (file: File, title: string) => void | Promise<void>;
  onCancel: () => void;
}

export function FileForm({ busy, onSubmit, onCancel }: FileFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  // 使用者自己改過標題之後，換檔案就不要再蓋掉他打的字。
  const [titleTouched, setTitleTouched] = useState(false);

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return;
        void onSubmit(file, title || file.name);
      }}
    >
      <h3>上傳檔案</h3>
      <p className="hint">
        單檔上限 {formatBytes(MAX_UPLOAD_BYTES)}，不接受影片檔。
      </p>

      <label className="field">
        <span>選擇檔案</span>
        <input
          type="file"
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            setFile(picked);
            if (picked && !titleTouched) setTitle(picked.name);
          }}
          required
        />
      </label>

      {file ? (
        <p className="hint">
          {file.name} · {formatBytes(file.size)} · {file.type || '未知類型'}
        </p>
      ) : null}

      <label className="field">
        <span>標題</span>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
          maxLength={100}
        />
      </label>

      <div className="choices">
        <button type="submit" className="btn" disabled={busy || !file}>
          {busy ? '上傳中…' : '上傳'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          取消
        </button>
      </div>
    </form>
  );
}
