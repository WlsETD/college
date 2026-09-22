/**
 * 總覽／作業／筆記／進度四個分頁的佔位畫面。
 *
 * 外殼與導覽是步驟 5 的範圍，四頁的內容要等步驟 6～8 把學期、科目、章節與
 * 內容項目做完才畫得出來。這裡先把版面骨架與空狀態立起來，順便讓像素字級、
 * 硬陰影、缺重點三重編碼這些 token 在真的畫面上看得到。
 */

import { Link } from 'react-router-dom';

import { useGroups } from '../lib/groupContext';

export interface PlaceholderPageProps {
  title: string;
  /** 這一頁之後會放什麼。 */
  summary: string;
  /** 對應開發順序的哪一步。 */
  step: string;
}

export default function PlaceholderPage({ title, summary, step }: PlaceholderPageProps) {
  const { activeGroup, groups } = useGroups();

  if (groups !== null && groups.length === 0) {
    return (
      <section>
        <h1>{title}</h1>
        <div className="panel">
          <h2>還沒有群組</h2>
          <p className="hint">先建立一個班群，或請同學把邀請連結給你。</p>
          <Link className="btn" to="/app/settings">
            去設定
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <p className="eyebrow">{activeGroup ? activeGroup.groupName : '載入中…'}</p>
      <h1>{title}</h1>
      <div className="panel">
        <h2>還沒有資料</h2>
        <p className="hint">{summary}</p>
        <p className="hint">這一頁的內容在{step}實作。</p>
      </div>
    </section>
  );
}
