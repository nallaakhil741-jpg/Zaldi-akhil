import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  getIdTokenResult,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';

export type AdminCollection =
  | 'orders'
  | 'drivers'
  | 'cities'
  | 'zones'
  | 'customers'
  | 'vehicleTypes'
  | 'bookingStatuses'
  | 'paymentMethods'
  | 'commissions'
  | 'transactions'
  | 'wallets'
  | 'invoices'
  | 'refunds'
  | 'roles'
  | 'permissions'
  | 'supportTickets'
  | 'content'
  | 'systemSettings';

export type FirestoreRecord = Record<string, unknown> & { id: string };

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => typeof value === 'string' && value.trim().length > 0,
);

const firebaseApp = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
const firestore = firebaseApp ? getFirestore(firebaseApp) : null;

function requireFirestore() {
  if (!firestore) {
    throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to .env.local.');
  }
  return firestore;
}

export async function signInAdmin(email: string, password: string): Promise<User> {
  if (!firebaseAuth) {
    throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to .env.local.');
  }

  const credentials = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
  const token = await getIdTokenResult(credentials.user, true);
  if (token.claims.admin !== true && token.claims.role !== 'admin') {
    await signOut(firebaseAuth);
    throw new Error('This account is authenticated but does not have the admin role.');
  }

  return credentials.user;
}

export async function signOutFirebase(): Promise<void> {
  if (firebaseAuth) await signOut(firebaseAuth);
}

export function listenToAdminCollection(
  name: AdminCollection,
  onRecords: (records: FirestoreRecord[]) => void,
  onError: (error: Error) => void,
): () => void {
  const database = requireFirestore();
  return onSnapshot(
    collection(database, name),
    (snapshot) => onRecords(snapshot.docs.map((entry) => ({
      ...entry.data(),
      id: entry.id,
    }))),
    onError,
  );
}

export async function createAdminRecord(
  name: AdminCollection,
  record: Omit<FirestoreRecord, 'id'>,
): Promise<string> {
  const result = await addDoc(collection(requireFirestore(), name), record as DocumentData);
  return result.id;
}

export async function updateAdminRecord(
  name: AdminCollection,
  id: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await updateDoc(doc(requireFirestore(), name, id), changes as DocumentData);
}

export async function deleteAdminRecord(name: AdminCollection, id: string): Promise<void> {
  await deleteDoc(doc(requireFirestore(), name, id));
}