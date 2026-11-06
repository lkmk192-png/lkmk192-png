import fs from 'fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const configUrl = new URL('../../firebase-applet-config.json', import.meta.url);
const firebaseConfig = JSON.parse(fs.readFileSync(configUrl, 'utf-8'));

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

export const adminAuth = getAuth();
