/**
 * Cloud Functions 進入點。
 *
 * 區域與 App Check 的設定集中在 options.ts，每個函式明確帶上。
 * 不用 setGlobalOptions——ES modules 的 import 會在這個檔案的本體執行前
 * 就把子模組的函式定義完，全域設定套不上去，詳見 options.ts 的註解。
 *
 * 本機用 Emulator 開發時，前端會送一張假的 App Check token（只在
 * VITE_USE_EMULATOR=true 時），Functions Emulator 會跳過簽章驗證，
 * 所以這裡不需要為了模擬器放寬 enforceAppCheck。
 */

import { onCall } from 'firebase-functions/v2/https';
import { TZ } from '@jindu/shared';

import { CALLABLE } from './options';

/** 連通性檢查，供 Emulator 驗證 workspace 打包是否正確。 */
export const ping = onCall(CALLABLE, () => ({
  ok: true,
  timezone: TZ,
  at: new Date().toISOString(),
}));

export {
  createInvite,
  rotateInvite,
  updateInviteExpiry,
  listInvites,
  joinByInvite,
  peekInvite,
} from './invites';

export { onGroupWritten } from './sync';
