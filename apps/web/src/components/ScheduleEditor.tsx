/**
 * 上課時間編輯器。
 *
 * 一個科目可以有多個時段；weekday 用 ISO 星期（1 = 週一 … 7 = 週日），
 * 和 @jindu/shared 的 nextClassDate() 一致，「下堂課」才算得對。
 */

import type { ClassSlot, IsoWeekday } from '@jindu/shared';

const WEEKDAYS: { value: IsoWeekday; label: string }[] = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' },
];

export interface ScheduleEditorProps {
  value: ClassSlot[];
  onChange: (next: ClassSlot[]) => void;
}

export default function ScheduleEditor({ value, onChange }: ScheduleEditorProps) {
  function patch(index: number, slot: Partial<ClassSlot>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...slot } : item)));
  }

  return (
    <div>
      <p className="field-label">上課時間</p>

      {value.length === 0 ? <p className="hint">還沒有時段。沒有時段的話算不出「下堂課」。</p> : null}

      <ul className="slot-list">
        {value.map((slot, index) => (
          // 時段沒有 id，順序就是身分，用 index 當 key 是這裡唯一合理的選擇。
          // eslint-disable-next-line react/no-array-index-key
          <li key={index} className="slot">
            <div className="weekday-row" role="group" aria-label={`第 ${index + 1} 個時段的星期`}>
              {WEEKDAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  className={slot.weekday === day.value ? 'btn btn-small btn-on' : 'btn btn-small'}
                  aria-pressed={slot.weekday === day.value}
                  onClick={() => patch(index, { weekday: day.value })}
                >
                  {day.label}
                </button>
              ))}
            </div>

            <div className="slot-times">
              <label className="field">
                <span>開始</span>
                <input
                  type="time"
                  value={slot.start}
                  onChange={(e) => patch(index, { start: e.target.value })}
                  required
                />
              </label>
              <label className="field">
                <span>結束（可留空）</span>
                <input
                  type="time"
                  value={slot.end ?? ''}
                  onChange={(e) => patch(index, { end: e.target.value || undefined })}
                />
              </label>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                移除
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn-small"
        onClick={() => onChange([...value, { weekday: 1, start: '09:10' }])}
      >
        ＋ 新增時段
      </button>
    </div>
  );
}

/** 給清單顯示用的摘要，例如「一 09:10・四 13:20」。 */
export function describeSchedule(schedule: readonly ClassSlot[]): string {
  if (schedule.length === 0) return '未排課';
  return schedule
    .map((slot) => `${WEEKDAYS.find((d) => d.value === slot.weekday)?.label ?? '?'} ${slot.start}`)
    .join('・');
}
