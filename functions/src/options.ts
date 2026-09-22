/**
 * Functions 的共用設定。
 *
 * 為什麼不用 setGlobalOptions：
 * ES modules 的 import 會在匯入它的模組本體執行「之前」就先跑完，所以
 * index.ts 裡呼叫 setGlobalOptions() 時，invites.ts / sync.ts 早就已經
 * 把 onCall() 定義好了，全域設定完全套不上去——實際後果是那些函式跑到
 * us-central1，而且沒有開啟 App Check 強制。
 *
 * 所以這裡改成把設定寫成常數，每個函式明確帶上，不依賴載入順序。
 */

import type { CallableOptions } from 'firebase-functions/v2/https';
import type { DocumentOptions } from 'firebase-functions/v2/firestore';

export const REGION = 'asia-east1';
const MAX_INSTANCES = 10;

/**
 * 所有 Callable 共用。App Check 的強制在這裡開啟，不寫進安全規則——
 * request.app 在 Emulator 中不受支援，寫進規則會讓規則測試整批失敗。
 * Firestore / Storage 的 enforcement 請在 Firebase Console 分別開啟。
 */
export const CALLABLE: CallableOptions = {
  region: REGION,
  maxInstances: MAX_INSTANCES,
  enforceAppCheck: true,
};

/** Firestore 觸發器。觸發器沒有呼叫端，App Check 不適用。 */
export function documentTrigger(document: string): DocumentOptions {
  return { region: REGION, maxInstances: MAX_INSTANCES, document };
}
