import { holidayFile, nextClassDate, toDateKey, holidayDates } from '@jindu/shared';

/**
 * 階段一步驟 1 的骨架畫面。
 * 這裡只驗證 workspace 連通與共用純函式可用，正式 UI 於步驟 5 之後實作。
 */
export default function App() {
  const now = new Date();
  const demo = nextClassDate({
    now,
    schedule: [
      { weekday: 2, start: '09:10' },
      { weekday: 5, start: '13:20' },
    ],
    holidays: holidayDates(),
  });

  return (
    <main className="shell">
      <p className="eyebrow">階段一 · 步驟 1 骨架</p>
      <h1>進度本</h1>
      <dl className="probe">
        <dt>今天（台北）</dt>
        <dd>{toDateKey(now)}</dd>
        <dt>示範科目的下堂課</dt>
        <dd>{demo ? toDateKey(demo) : '—'}</dd>
        <dt>假日資料</dt>
        <dd>
          {holidayFile.schoolYear} 學年 · {holidayFile.holidays.length} 筆
          {holidayFile.verified ? '' : '（尚未核對）'}
        </dd>
      </dl>
    </main>
  );
}
