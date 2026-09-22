/**
 * 路由與外殼。
 *
 * /app 底下的分頁共用 AppShell（頁首 + 底部導覽）；登入頁與邀請落地頁沒有導覽。
 *
 * 除了登入與四個主要分頁以外都用 React.lazy 切開：設定底下那一大串
 * （科目、章節、內容、精靈、邀請）平常用不到，不該躺在首次載入的 bundle 裡。
 */

import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import AppShell from './components/AppShell';
import { AuthProvider, useAuth } from './lib/auth';
import { GroupProvider } from './lib/groupContext';
import LoginPage from './routes/LoginPage';

// 四個主要分頁：進 app 第一眼就會用到，不切。
import HomeworkPage from './routes/HomeworkPage';
import NotesPage from './routes/NotesPage';
import OverviewPage from './routes/OverviewPage';
import ProgressPage from './routes/ProgressPage';

// 設定與管理：按到才載。
const ChaptersPage = lazy(() => import('./routes/ChaptersPage'));
const EnrollmentPage = lazy(() => import('./routes/EnrollmentPage'));
const InvitePage = lazy(() => import('./routes/InvitePage'));
const ItemsPage = lazy(() => import('./routes/ItemsPage'));
const JoinPage = lazy(() => import('./routes/JoinPage'));
const SettingsPage = lazy(() => import('./routes/SettingsPage'));
const SetupWizardPage = lazy(() => import('./routes/SetupWizardPage'));
const SubjectsPage = lazy(() => import('./routes/SubjectsPage'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="hint">確認登入狀態…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function Loading() {
  return <p className="hint">載入中…</p>;
}

export default function App() {
  return (
    <BrowserRouter
      // 先開起 v7 的兩個行為旗標，免得 console 一直跳升級警告。
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <GroupProvider>
          <Suspense fallback={<Loading />}>
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
                <Route path="overview" element={<OverviewPage />} />
                <Route path="homework" element={<HomeworkPage />} />
                <Route path="notes" element={<NotesPage />} />
                <Route path="progress" element={<ProgressPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="settings/invite/:gid" element={<InvitePage />} />
                <Route path="settings/subjects" element={<SubjectsPage />} />
                <Route path="settings/subjects/:subId" element={<ChaptersPage />} />
                <Route path="settings/subjects/:subId/items" element={<ItemsPage />} />
                <Route path="settings/enrollment" element={<EnrollmentPage />} />
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
          </Suspense>
        </GroupProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
