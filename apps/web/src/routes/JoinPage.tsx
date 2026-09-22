/**
 * /join/:token —— 邀請連結落地頁。
 *
 * 流程（docs/00_architecture.html「三個關鍵流程 A」）：
 *   開連結 → 先 peek 看連結還有沒有效 → Google 登入 → 呼叫 joinByInvite
 *   → Function 以 Admin SDK 寫 roles[uid]='viewer' → 補自己的 members 文件
 *   → 之後導向「選擇我修的科目」（步驟 7 才做，這裡先回群組清單）。
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { writeActiveGid } from '../lib/activeGroup';
import { useAuth } from '../lib/auth';
import { callJoinByInvite, callPeekInvite, ensureMemberDoc } from '../lib/groups';
import { describeAuthError } from './LoginPage';
import { describeCallableError } from './InvitePage';

const REASON_LABEL: Record<string, string> = {
  'not-found': '這個邀請連結不存在',
  revoked: '這個邀請連結已經被重新產生，舊的失效了',
  expired: '這個邀請連結已經過期',
  deleted: '這個邀請連結已被刪除',
};

type Status =
  | { kind: 'checking' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; groupName: string | null }
  | { kind: 'joining' }
  | { kind: 'error'; message: string };

export default function JoinPage() {
  const { token = '' } = useParams();
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await callPeekInvite({ token });
        if (cancelled) return;
        if (!res.data.valid) {
          setStatus({
            kind: 'invalid',
            message: REASON_LABEL[res.data.reason ?? 'not-found'] ?? '這個邀請連結無法使用',
          });
          return;
        }
        setStatus({ kind: 'ready', groupName: res.data.groupName });
      } catch (err) {
        if (!cancelled) setStatus({ kind: 'error', message: describeCallableError(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const join = useCallback(async () => {
    if (!user) return;
    setStatus({ kind: 'joining' });
    try {
      const res = await callJoinByInvite({ token });
      await ensureMemberDoc(res.data.gid, {
        uid: user.uid,
        displayName: user.displayName ?? '未命名',
        photoURL: user.photoURL ?? null,
      });
      writeActiveGid(res.data.gid);
      navigate('/app/overview', { replace: true });
    } catch (err) {
      setStatus({ kind: 'error', message: describeCallableError(err) });
    }
  }, [navigate, token, user]);

  async function handleSignIn() {
    try {
      await signIn();
    } catch (err) {
      setStatus({ kind: 'error', message: describeAuthError(err) });
    }
  }

  return (
    <section>
      <p className="eyebrow">邀請加入</p>
      <h1>進度本</h1>

      {status.kind === 'checking' || loading ? <p className="hint">確認連結中…</p> : null}

      {status.kind === 'invalid' ? (
        <>
          <p className="error">▲ {status.message}</p>
          <p className="hint">請向該班的管理者要一份新的連結。</p>
        </>
      ) : null}

      {status.kind === 'error' ? <p className="error">▲ {status.message}</p> : null}

      {status.kind === 'ready' && !loading ? (
        <>
          <p>
            你受邀加入
            <strong>{status.groupName ? `「${status.groupName}」` : '一個班群'}</strong>，
            加入後的角色是<strong>檢視者</strong>。
          </p>
          {user ? (
            <button type="button" className="btn" onClick={() => void join()}>
              加入
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => void handleSignIn()}>
              用 Google 登入後加入
            </button>
          )}
        </>
      ) : null}

      {status.kind === 'joining' ? <p className="hint">加入中…</p> : null}
    </section>
  );
}
