/**
 * 科目色塊。色塊只是輔助，一律搭配 3 字簡稱文字（UI 規範：狀態不能只靠顏色）。
 */

import type { SubjectRow } from '../lib/subjects';

export function SubjectChip({ subject }: { subject: SubjectRow | undefined }) {
  if (!subject) return <span className="tag">（科目已刪除）</span>;
  return (
    <span
      className="subject-chip"
      style={{ ['--subject-color' as string]: `var(--subject-${subject.colorIndex})` }}
      title={subject.name}
    >
      {subject.shortName}
    </span>
  );
}

export interface SubjectFilterProps {
  subjects: readonly SubjectRow[];
  value: string | null;
  onChange: (subId: string | null) => void;
  /** 顯示「全部」這個選項。 */
  allowAll?: boolean;
}

/** 科目選擇列。分頁裡要看哪一科就點哪一顆。 */
export function SubjectFilter({ subjects, value, onChange, allowAll = true }: SubjectFilterProps) {
  return (
    <div className="choices" role="group" aria-label="選擇科目">
      {allowAll ? (
        <button
          type="button"
          className={value === null ? 'btn btn-small btn-on' : 'btn btn-small'}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
        >
          全部
        </button>
      ) : null}
      {subjects.map((subject) => (
        <button
          key={subject.id}
          type="button"
          className={value === subject.id ? 'btn btn-small btn-on' : 'btn btn-small'}
          aria-pressed={value === subject.id}
          onClick={() => onChange(subject.id)}
        >
          {subject.shortName}
        </button>
      ))}
    </div>
  );
}
