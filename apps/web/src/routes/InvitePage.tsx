import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { toDateKey } from '@jindu/shared';
import {
  callCreateInvite,
  callListInvites,
  callRotateInvite,
  callUpdateInviteExpiry,
  inviteLink,
  watchMembers,
  type InviteSummary,
  type IssuedInvite,
  type MemberRow,
} from '../lib/groups';

const DAY = 24 * 60 * 60 * 1000;

const EXPIRY_CHOICES: { label: string; days: number | null }[] = [
  { label: '不過期', days: null },
  { label: '7 天', days: 7 },
  { label: '30 天', days: 30 },
];

const REJECTION_LABEL: Record<string, string> = {
  revoked: '已失效',
  expired: '已過期',
  deleted: '已刪除',
};

export default function InvitePage() {
  const { gid = '' } = useParams();
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const [invites, setInvites] = useState<InviteSummary[] | null>(null);
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await callListInvites({ gid });
      setInvites(res.data.invites);
    } catch (err) {
      setError(describeCallableError(err));
    }
  }, [gid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      watchMembers(
        gid,
        setMembers,
        (err) => setError(err.message),
      ),
    [gid],
  );

  function expiresAt(): number | null {
    return days === null ? null : Date.now() + days * DAY;
  }

  async function run(action: 'create' | 'rotate') {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const call = action === 'create' ? callCreateInvite : callRotateInvite;
      const res = await call({ gid, expiresAt: expiresAt() });
      setIssued(res.data);
      await refresh();
    } catch (err) {
      setError(describeCallableError(err));
    } finally {
      setBusy(false);
    }
  }

  async function changeExpiry(inviteId: string) {
    setBusy(true);
    setError(null);
    try {
      await callUpdateInviteExpiry({ gid, inviteId, expiresAt: expiresAt() });
      await refresh();
    } catch (err) {
      setError(describeCallableError(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section>
      <p className="eyebrow">
        <Link to="/app">← 我的群組</Link>
      </p>
      <h1>邀請連結</h1>

      {error ? <p className="error">▲ {error}</p> : null}

      <div className="panel">
        <h2>到期時間</h2>
        <div className="choices">
          {EXPIRY_CHOICES.map((choice) => (
            <button
              key={choice.label}
              type="button"
              className={days === choice.days ? 'btn btn-small btn-on' : 'btn btn-small'}
              onClick={() => setDays(choice.days)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <div className="choices">
          <button type="button" className="btn" disabled={busy} onClick={() => void run('create')}>
            建立邀請連結
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void run('rotate')}>
            重新產生（舊連結立即失效）
          </button>
        </div>
      </div>

      {issued ? (
        <div className="panel panel-highlight">
          <h2>新的邀請連結</h2>
          <p className="hint">
            ▲ 這串連結只會顯示這一次。Firestore 只存 token 的雜湊，關掉就拿不回來，
            只能重新產生。
          </p>
          <code className="token">{inviteLink(issued.token)}</code>
          <div className="choices">
            <button type="button" className="btn btn-small" onClick={() => void copyLink(issued.token)}>
              {copied ? '已複製 ✓' : '複製'}
            </button>
          </div>
          <p className="hint">
            到期：{issued.expiresAt === null ? '不過期' : toDateKey(new Date(issued.expiresAt))}
          </p>
        </div>
      ) : null}

      <div className="panel">
        <h2>目前的邀請</h2>
        {invites === null ? <p className="hint">載入中…</p> : null}
        {invites !== null && invites.length === 0 ? (
          <p className="hint">還沒有任何邀請連結。</p>
        ) : null}
        {invites !== null && invites.length > 0 ? (
          <ul className="card-list">
            {invites.map((invite) => (
              <li key={invite.inviteId} className="card">
                <div className="card-main">
                  <strong>{invite.rejection ? REJECTION_LABEL[invite.rejection] : '● 可用'}</strong>
                  <span className="tag">
                    到期：
                    {invite.expiresAt === null ? '不過期' : toDateKey(new Date(invite.expiresAt))}
                  </span>
                </div>
                {invite.rejection ? null : (
                  <div className="card-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy}
                      onClick={() => void changeExpiry(invite.inviteId)}
                    >
                      套用上面的到期時間
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="panel">
        <h2>成員</h2>
        {members === null ? (
          <p className="hint">載入中…</p>
        ) : (
          <ul className="card-list">
            {members.map((member) => (
              <li key={member.id} className="card">
                <div className="card-main">
                  <strong>{member.displayName || member.uid}</strong>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function describeCallableError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? '';
  if (code.endsWith('permission-denied')) return '你沒有權限做這件事';
  if (code.endsWith('resource-exhausted')) return '操作太頻繁，請稍後再試';
  if (code.endsWith('unauthenticated')) return '請重新登入（或檢查 App Check 設定）';
  if (code.endsWith('not-found')) return '找不到資料，或連結已失效';
  return e?.message ?? '操作失敗';
}
