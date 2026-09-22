/**
 * 應用程式外殼：頁首 + 內容 + 底部導覽。
 *
 * 頁首左邊是目前群組（點了跳到設定頁切換），右邊是目前學期。
 * 學期要到步驟 6 才有資料，先顯示「尚未設定」。
 */

import { Link, Outlet } from 'react-router-dom';

import { ROLE_LABEL, useGroups } from '../lib/groupContext';
import BottomNav from './BottomNav';

export default function AppShell() {
  const { activeGroup, groups } = useGroups();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link className="btn btn-small" to="/app/settings">
            {activeGroup ? activeGroup.groupName : groups === null ? '載入中…' : '尚未加入群組'}
            <span aria-hidden="true"> ▾</span>
            <span className="sr-only">切換群組</span>
          </Link>
          <span className="app-title">
            {activeGroup ? (ROLE_LABEL[activeGroup.role] ?? activeGroup.role) : '—'} · 學期尚未設定
          </span>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
