/**
 * 科目表單：名稱、3 字以內簡稱、12 色選一、上課時間。
 *
 * 色塊只是輔助，清單上一律搭配簡稱文字顯示（UI 規範：狀態不能只靠顏色）。
 */

import { useState } from 'react';
import type { ClassSlot, SubjectColorIndex } from '@jindu/shared';

import ScheduleEditor from './ScheduleEditor';
import type { SubjectInput } from '../lib/subjects';

const COLOR_INDEXES: SubjectColorIndex[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export interface SubjectFormProps {
  initial?: Partial<SubjectInput>;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (input: SubjectInput) => void | Promise<void>;
  onCancel?: () => void;
}

export default function SubjectForm({
  initial,
  submitLabel,
  busy = false,
  onSubmit,
  onCancel,
}: SubjectFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [shortName, setShortName] = useState(initial?.shortName ?? '');
  const [colorIndex, setColorIndex] = useState<SubjectColorIndex>(initial?.colorIndex ?? 0);
  const [schedule, setSchedule] = useState<ClassSlot[]>(initial?.schedule ?? []);

  const trimmedShort = shortName.trim();
  const canSubmit = name.trim() !== '' && trimmedShort !== '' && !busy;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit({ name, shortName: trimmedShort, colorIndex, schedule });
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <label className="field">
        <span>科目名稱</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：微積分"
          maxLength={30}
          required
        />
      </label>

      <label className="field">
        <span>簡稱（3 字以內）</span>
        <input
          value={shortName}
          onChange={(e) => setShortName([...e.target.value].slice(0, 3).join(''))}
          placeholder="例：微積"
          required
        />
      </label>

      <fieldset className="color-picker">
        <legend className="field-label">顏色</legend>
        <div className="color-grid">
          {COLOR_INDEXES.map((index) => (
            <button
              key={index}
              type="button"
              className={colorIndex === index ? 'color-swatch color-swatch-on' : 'color-swatch'}
              style={{ ['--subject-color' as string]: `var(--subject-${index})` }}
              aria-pressed={colorIndex === index}
              aria-label={`第 ${index + 1} 色`}
              onClick={() => setColorIndex(index)}
            >
              {/* 選中的用勾勾標示，不只靠顏色與外框。 */}
              <span aria-hidden="true">{colorIndex === index ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="preview-row">
        <span className="hint">預覽</span>
        <span
          className="subject-chip"
          style={{ ['--subject-color' as string]: `var(--subject-${colorIndex})` }}
        >
          {trimmedShort || '簡稱'}
        </span>
      </div>

      <ScheduleEditor value={schedule} onChange={setSchedule} />

      <div className="choices">
        <button type="submit" className="btn" disabled={!canSubmit}>
          {busy ? '儲存中…' : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
        ) : null}
      </div>
    </form>
  );
}
