/** 目前選到的群組。存在 localStorage，換裝置不同步。 */

const KEY = 'jindu.activeGid';

export function readActiveGid(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeActiveGid(gid: string | null): void {
  try {
    if (gid === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, gid);
  } catch {
    // 無痕模式等情境下寫不進去，忽略即可。
  }
}
