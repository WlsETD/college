/**
 * Cloud Functions 進入點。
 *
 * 階段一步驟 1 只留骨架。步驟 4 會加上：
 *   - joinByInvite：以 Admin SDK 寫入 roles。非成員無法通過安全規則自行寫入，
 *     所以邀請加入一定要走後端。
 *   - rotateInvite：重新產生 token，舊連結立即失效。
 */

import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { TZ } from '@jindu/shared';

setGlobalOptions({
  region: 'asia-east1',
  maxInstances: 10,
  // App Check 的強制在這裡開啟，不寫進安全規則。
  enforceAppCheck: true,
});

/** 連通性檢查，供 Emulator 驗證 workspace 打包是否正確。 */
export const ping = onCall(() => ({
  ok: true,
  timezone: TZ,
  at: new Date().toISOString(),
}));
