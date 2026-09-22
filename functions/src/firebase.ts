/** Admin SDK 單例。Admin SDK 會繞過安全規則，所有權限判斷都要自己做。 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
