/**
 * 環境變數讀取與檢查。
 *
 * 所有值都來自 .env.local（複製自根目錄的 .env.example），
 * 任何真實金鑰都不進版控。
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`缺少環境變數 ${name}，請參考根目錄的 .env.example 建立 apps/web/.env.local`);
  }
  return value;
}

const env = import.meta.env;

/** 連本機 Emulator 而不是正式環境。 */
export const useEmulator = env.VITE_USE_EMULATOR === 'true';

export const firebaseConfig = {
  apiKey: required('VITE_FIREBASE_API_KEY', env.VITE_FIREBASE_API_KEY),
  authDomain: required('VITE_FIREBASE_AUTH_DOMAIN', env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: required('VITE_FIREBASE_PROJECT_ID', env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: required('VITE_FIREBASE_STORAGE_BUCKET', env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: required(
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  ),
  appId: required('VITE_FIREBASE_APP_ID', env.VITE_FIREBASE_APP_ID),
};

/** reCAPTCHA Enterprise 網站金鑰。連 Emulator 時用不到。 */
export const recaptchaSiteKey = env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ?? '';

/** 本機 App Check debug token，留空代表不啟用。 */
export const appCheckDebugToken = env.VITE_APPCHECK_DEBUG_TOKEN ?? '';

/** Cloud Functions 的區域，要和 functions/src/index.ts 的 setGlobalOptions 一致。 */
export const functionsRegion = 'asia-east1';

/** Emulator 的連接埠，和 firebase.json 一致。 */
export const emulatorPorts = {
  auth: 9099,
  firestore: 8080,
  functions: 5001,
  storage: 9199,
} as const;
