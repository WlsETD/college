/**
 * Firebase 初始化。整個前端只有這裡建立 SDK 實例。
 *
 * App Check：
 *   Cloud Functions 端是 enforceAppCheck: true，而且「沒有帶 token」一定會被拒，
 *   在 Emulator 也一樣。但 App Check 的正式 token 要向 Google 的服務換發，
 *   demo 專案換不到，所以連 Emulator 時改用 CustomProvider 送一張
 *   未簽章的假 token——Functions Emulator 會跳過簽章驗證（skipTokenVerification），
 *   只解出 app_id。這條路徑只在 VITE_USE_EMULATOR=true 時啟用。
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  CustomProvider,
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
} from 'firebase/app-check';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

import {
  appCheckDebugToken,
  emulatorPorts,
  firebaseConfig,
  functionsRegion,
  recaptchaSiteKey,
  useEmulator,
} from './env';

const EMULATOR_HOST = '127.0.0.1';

export const app: FirebaseApp = initializeApp(firebaseConfig);

setUpAppCheck(app);

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export const functions: Functions = getFunctions(app, functionsRegion);

if (useEmulator) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${emulatorPorts.auth}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, EMULATOR_HOST, emulatorPorts.firestore);
  connectFunctionsEmulator(functions, EMULATOR_HOST, emulatorPorts.functions);
  connectStorageEmulator(storage, EMULATOR_HOST, emulatorPorts.storage);
}

function setUpAppCheck(firebaseApp: FirebaseApp): void {
  if (useEmulator) {
    initializeAppCheck(firebaseApp, {
      provider: new CustomProvider({ getToken: async () => emulatorAppCheckToken() }),
      isTokenAutoRefreshEnabled: false,
    });
    return;
  }

  if (!recaptchaSiteKey) {
    // 正式環境沒設金鑰就不初始化，讓呼叫直接失敗而不是靜默降級。
    console.warn('未設定 VITE_RECAPTCHA_ENTERPRISE_SITE_KEY，App Check 未啟用');
    return;
  }

  if (appCheckDebugToken) {
    (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      appCheckDebugToken;
  }

  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

/**
 * 只給 Emulator 用的假 App Check token。
 * 格式是未簽章的 JWT，Functions Emulator 只會把 payload 解開讀 app_id。
 * 正式環境永遠走不到這裡。
 */
function emulatorAppCheckToken(): { token: string; expireTimeMillis: number } {
  const expireTimeMillis = Date.now() + 60 * 60 * 1000;
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      app_id: `${firebaseConfig.projectId}-emulator`,
      aud: [`projects/${firebaseConfig.projectId}`],
      exp: Math.floor(expireTimeMillis / 1000),
      iat: Math.floor(Date.now() / 1000),
      sub: firebaseConfig.appId,
    }),
  );
  return { token: `${header}.${payload}.`, expireTimeMillis };
}

function base64url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
