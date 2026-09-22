/**
 * 路由骨架。
 *
 * 正式的外殼與底部導覽在步驟 5 才做，這裡只把步驟 4 的四個畫面接起來：
 * 登入、我的群組（含建立與切換）、邀請連結管理、邀請落地頁。
 */

import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { AuthProvider, useAuth } from './lib/auth';
import GroupsPage from './routes/GroupsPage';
import InvitePage from './routes/InvitePage';
import JoinPage from './routes/JoinPage';
import LoginPage from './routes/LoginPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="hint">確認登入狀態…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter
      // 先開起 v7 的兩個行為旗標，免得 console 一直跳升級警告。
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <main className="shell">
          <Routes>
            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/join/:token" element={<JoinPage />} />
            <Route
              path="/app"
              element={
                <RequireAuth>
                  <GroupsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/app/:gid/invite"
              element={
                <RequireAuth>
                  <InvitePage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<p className="hint">找不到這個頁面。</p>} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
}
