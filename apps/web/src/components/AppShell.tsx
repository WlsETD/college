/**
 * 應用程式外殼：頁首 + 內容 + 底部導覽。
 *
 * 頁首左邊是目前群組（點了跳到設定頁切換），右邊是角色與目前學期。
 */

import { Link, Outlet } from 'react-router-dom';

import { ROLE_LABEL, useGroups } from '../lib/groupContext';
import BottomNav from './BottomNav';

export default function AppShell() {
  const { activeGroup, groups, activeSemester, activeSemesterId } = useGroups();

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
            {activeGroup ? (ROLE_LABEL[activeGroup.role] ?? activeGroup.role) : '—'} ·{' '}
            {activeSemester
              ? `${activeSemester.name} 學期`
              : activeSemesterId
                ? '學期載入中…'
                : '學期尚未設定'}
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
