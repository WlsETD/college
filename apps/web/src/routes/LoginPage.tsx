import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="hint">確認登入狀態…</p>;

  if (user) {
    const next = (location.state as { from?: string } | null)?.from ?? '/app';
    return <Navigate to={next} replace />;
  }

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p className="eyebrow">課程進度 · 作業提醒</p>
      <h1>進度本</h1>
      <p>大學班級共用的課程進度與作業提醒。請先用 Google 帳號登入。</p>
      <button type="button" className="btn" onClick={handleSignIn} disabled={busy}>
        {busy ? '登入中…' : '用 Google 登入'}
      </button>
      {error ? <p className="error">▲ {error}</p> : null}
    </section>
  );
}

export function describeAuthError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (code === 'auth/popup-closed-by-user') return '登入視窗被關掉了，請再試一次';
  if (code === 'auth/popup-blocked') return '瀏覽器擋掉了登入視窗，請允許彈出視窗';
  if (code === 'auth/network-request-failed') return '連不上伺服器，請檢查網路或 Emulator 是否啟動';
  return (err as Error)?.message ?? '登入失敗';
}
