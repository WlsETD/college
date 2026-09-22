/**
 * 底部導覽。五個分頁對應架構圖「08 頁面」那一節，外加設定。
 *
 * 圖示本身是裝飾性的（旁邊已經有文字標籤），所以 aria-hidden；
 * 目前分頁靠 aria-current + 頂端指示條標示，不只靠顏色。
 */

import { NavLink } from 'react-router-dom';

import PixelIcon, { type PixelIconName } from './PixelIcon';

const TABS: { to: string; label: string; icon: PixelIconName }[] = [
  { to: '/app/overview', label: '總覽', icon: 'overview' },
  { to: '/app/homework', label: '作業', icon: 'homework' },
  { to: '/app/notes', label: '筆記', icon: 'notes' },
  { to: '/app/progress', label: '進度', icon: 'progress' },
  { to: '/app/settings', label: '設定', icon: 'settings' },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="主要導覽">
      <div className="bottom-nav-inner">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className="nav-item">
            <PixelIcon name={tab.icon} />
            <span className="nav-label">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
