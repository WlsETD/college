/**
 * 路由與外殼。
 *
 * /app 底下的五個分頁共用 AppShell（頁首 + 底部導覽）；登入頁與邀請落地頁
 * 沒有導覽，走另一套簡單版面。四個內容分頁目前是佔位畫面，步驟 6～8 才填。
 */

import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import AppShell from './components/AppShell';
import { AuthProvider, useAuth } from './lib/auth';
import { GroupProvider } from './lib/groupContext';
import InvitePage from './routes/InvitePage';
import JoinPage from './routes/JoinPage';
import LoginPage from './routes/LoginPage';
import ChaptersPage from './routes/ChaptersPage';
import PlaceholderPage from './routes/PlaceholderPage';
import SetupWizardPage from './routes/SetupWizardPage';
import SubjectsPage from './routes/SubjectsPage';
import SettingsPage from './routes/SettingsPage';

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
        <GroupProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/app" replace />} />

            <Route
              path="/login"
              element={
                <main className="shell">
                  <LoginPage />
                </main>
              }
            />
            <Route
              path="/join/:token"
              element={
                <main className="shell">
                  <JoinPage />
                </main>
              }
            />

            <Route
              path="/app"
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<Navigate to="/app/overview" replace />} />
              <Route
                path="overview"
                element={
                  <PlaceholderPage
                    title="總覽"
                    summary="7 天內到期的作業會列在這裡，依到期日排序。"
                    step="步驟 8"
                  />
                }
              />
              <Route
                path="homework"
                element={
                  <PlaceholderPage
                    title="作業"
                    summary="依科目與到期日列出所有作業。"
                    step="步驟 8"
                  />
                }
              />
              <Route
                path="notes"
                element={
                  <PlaceholderPage
                    title="筆記"
                    summary="關鍵字、檔案與連結，依章節整理。"
                    step="步驟 8"
                  />
                }
              />
              <Route
                path="progress"
                element={
                  <PlaceholderPage
                    title="進度"
                    summary="章節樹、目前進度，以及缺重點的章節標示。"
                    step="步驟 8"
                  />
                }
              />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="settings/invite/:gid" element={<InvitePage />} />
              <Route path="settings/subjects" element={<SubjectsPage />} />
              <Route path="settings/subjects/:subId" element={<ChaptersPage />} />
              <Route path="setup" element={<SetupWizardPage />} />
            </Route>

            <Route
              path="*"
              element={
                <main className="shell">
                  <p className="hint">找不到這個頁面。</p>
                </main>
              }
            />
          </Routes>
        </GroupProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
