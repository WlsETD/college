import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { readActiveGid, writeActiveGid } from '../lib/activeGroup';
import { createGroup, watchMyGroups, type MyGroup } from '../lib/groups';

const ROLE_LABEL: Record<string, string> = {
  owner: '擁有者',
  admin: '管理者',
  viewer: '檢視者',
};

export default function GroupsPage() {
  const { user, signOutNow } = useAuth();
  const [groups, setGroups] = useState<MyGroup[] | null>(null);
  const [activeGid, setActiveGid] = useState<string | null>(() => readActiveGid());
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) return undefined;
    return watchMyGroups(
      uid,
      (rows) => {
        setGroups(rows);
        setActiveGid((current) => {
          if (current && rows.some((g) => g.gid === current)) return current;
          const fallback = rows[0]?.gid ?? null;
          writeActiveGid(fallback);
          return fallback;
        });
      },
      (err) => setError(err.message),
    );
  }, [uid]);

  function switchTo(gid: string) {
    writeActiveGid(gid);
    setActiveGid(gid);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!user || name.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const gid = await createGroup(name, {
        uid: user.uid,
        displayName: user.displayName ?? '未命名',
        photoURL: user.photoURL ?? null,
      });
      switchTo(gid);
      setName('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <p className="eyebrow">階段一 · 步驟 4 · 帳號與群組</p>
      <h1>我的群組</h1>

      <p className="hint">
        {user?.displayName ?? user?.email ?? '（未命名）'}
        <button type="button" className="btn btn-plain" onClick={() => void signOutNow()}>
          登出
        </button>
      </p>

      {error ? <p className="error">▲ {error}</p> : null}

      {groups === null ? <p className="hint">載入中…</p> : null}

      {groups !== null && groups.length === 0 ? (
        <p className="hint">
          還沒有加入任何群組。建立一個新的，或請同學把邀請連結給你。
        </p>
      ) : null}

      {groups !== null && groups.length > 0 ? (
        <ul className="card-list">
          {groups.map((group) => {
            const active = group.gid === activeGid;
            return (
              <li key={group.gid} className={active ? 'card card-active' : 'card'}>
                <div className="card-main">
                  <strong>{group.groupName}</strong>
                  <span className="tag">{ROLE_LABEL[group.role] ?? group.role}</span>
                  {active ? <span className="tag tag-active">● 目前</span> : null}
                </div>
                <div className="card-actions">
                  {active ? null : (
                    <button type="button" className="btn btn-small" onClick={() => switchTo(group.gid)}>
                      切換
                    </button>
                  )}
                  {group.role === 'viewer' ? null : (
                    <Link className="btn btn-small" to={`/app/${group.gid}/invite`}>
                      邀請連結
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <form className="panel" onSubmit={handleCreate}>
        <h2>建立群組</h2>
        <p className="hint">建立者會成為擁有者。</p>
        <label className="field">
          <span>群組名稱</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：資工一甲"
            maxLength={30}
            required
          />
        </label>
        <button type="submit" className="btn" disabled={busy || name.trim() === ''}>
          {busy ? '建立中…' : '建立'}
        </button>
        <p className="hint">
          建立後群組會晚一兩秒才出現在清單上——索引由 Cloud Function 維護。
        </p>
      </form>
    </section>
  );
}
