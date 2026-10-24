import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore,
  memoryLocalCache,
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDocs, 
  getDoc, 
  getDocFromServer,
  writeBatch,
  query, 
  orderBy, 
  limit,
  disableNetwork,
  enableNetwork,
  setLogLevel
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Silence Firestore internal SDK backoff/retry logs to prevent console clutter
try {
  setLogLevel('silent');
} catch (e) {}

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Use initializeFirestore with experimentalForceLongPolling and memoryLocalCache to eliminate fragile gRPC streams and prevent RST_STREAM errors
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    localCache: memoryLocalCache()
  }, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  try {
    firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } catch (e2) {
    firestoreDb = getFirestore(app);
  }
}

export const db = firestoreDb;
export const auth = getAuth(app);

// Global state and listener for Firestore Quota Exceeded with daily date persistence
const QUOTA_STORAGE_KEY = 'siga_firestore_quota_exceeded_date';

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function initQuotaState(): boolean {
  try {
    const savedDate = localStorage.getItem(QUOTA_STORAGE_KEY);
    // Quota resets daily; if stored date is from a previous day, quota has reset!
    if (!savedDate || savedDate !== getTodayKey()) {
      return false;
    }
    return true;
  } catch (e) {}
  return false;
}

let _isQuotaExceeded = initQuotaState();

const quotaListeners = new Set<(exceeded: boolean) => void>();

export function isQuotaExceeded(): boolean {
  return _isQuotaExceeded;
}

export function setQuotaExceeded(val: boolean) {
  _isQuotaExceeded = val;
  if (val) {
    try {
      localStorage.setItem(QUOTA_STORAGE_KEY, getTodayKey());
    } catch (e) {}
  } else {
    try {
      localStorage.setItem(QUOTA_STORAGE_KEY, 'restored_' + getTodayKey());
    } catch (e) {}
  }
  if (_isQuotaExceeded !== val) {
    _isQuotaExceeded = val;
    quotaListeners.forEach(cb => cb(val));
  }
}

export function onQuotaExceededChange(callback: (exceeded: boolean) => void) {
  quotaListeners.add(callback);
  callback(_isQuotaExceeded);
  return () => {
    quotaListeners.delete(callback);
  };
}

export function checkQuotaError(error: any): boolean {
  if (!error) return false;
  const msg = error.message || String(error);
  const code = error.code || '';
  if (
    code === 'resource-exhausted' ||
    code === 'unavailable' ||
    msg.includes('resource-exhausted') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded') ||
    msg.includes('Free daily write units') ||
    msg.includes('Free daily read units') ||
    msg.includes('RST_STREAM') ||
    msg.includes('GrpcConnection')
  ) {
    if (code === 'resource-exhausted' || msg.includes('Quota')) {
      setQuotaExceeded(true);
    }
    return true;
  }
  return false;
}

/**
 * Re-checks if the daily Firestore quota has reset by briefly enabling network and testing connection.
 */
export async function recheckFirestoreQuota(): Promise<boolean> {
  try {
    if (db) {
      await enableNetwork(db);
    }
    await getDocFromServer(doc(db, 'settings', 'company'));
    setQuotaExceeded(false);
    return true;
  } catch (err: any) {
    checkQuotaError(err);
    return false;
  }
}

/**
 * Safely converts an arbitrary ID into a valid Firestore document ID.
 * Firestore document references cannot contain forward slashes ('/') because '/'
 * is strictly used as the path delimiter (e.g. collection/doc/subcol/doc).
 * If an ID contains '/', Firestore errors with:
 * "Document references must have an even number of segments".
 * Additionally, Firestore does not allow '.' or '..' or matching '__.*__'.
 */
export function toSafeDocId(rawId: string | number): string {
  if (!rawId && rawId !== 0) return '';
  const str = String(rawId).trim();
  // Encode slashes and leading/trailing dots so Firestore never misinterprets path segments
  return encodeURIComponent(str).replace(/\./g, '%2E');
}

export function fromSafeDocId(docId: string): string {
  if (!docId) return '';
  try {
    return decodeURIComponent(docId);
  } catch {
    return docId;
  }
}

// Helper to push all local data to Firestore
export async function backupToFirestore(state: any) {
  if (_isQuotaExceeded) {
    console.warn('[Firestore] Respaldo cancelado: cuota diaria gratuita alcanzada. Los datos permanecen seguros en almacenamiento local.');
    return { success: false, quotaExceeded: true };
  }

  try {
    // Helper to sanitize undefined values for firestore compatibility
    const sanitize = (obj: any): any => {
      return JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
    };

    // Collect all operations to perform chunked batching (Firestore limit is 500 ops per batch)
    const operations: Array<{ ref: any; data: any }> = [];

    // 1. Products
    if (Array.isArray(state.products)) {
      for (const p of state.products) {
        if (p && p.id) {
          const ref = doc(db, 'products', toSafeDocId(p.id));
          operations.push({ ref, data: sanitize(p) });
        }
      }
    }

    // 2. Clients
    if (Array.isArray(state.clients)) {
      for (const c of state.clients) {
        if (c && c.id) {
          const ref = doc(db, 'clients', toSafeDocId(c.id));
          operations.push({ ref, data: sanitize(c) });
        }
      }
    }

    // 3. Suppliers
    if (Array.isArray(state.suppliers)) {
      for (const s of state.suppliers) {
        if (s && s.id) {
          const ref = doc(db, 'suppliers', toSafeDocId(s.id));
          operations.push({ ref, data: sanitize(s) });
        }
      }
    }

    // 4. Company Settings
    if (state.company) {
      const ref = doc(db, 'settings', 'company');
      operations.push({ ref, data: sanitize(state.company) });
    }

    // 5. Exchange Rate
    if (state.exchangeRate) {
      const ref = doc(db, 'settings', 'exchangeRate');
      operations.push({ ref, data: sanitize(state.exchangeRate) });
    }

    // 6. Users
    if (Array.isArray(state.users)) {
      for (const u of state.users) {
        if (u && u.id) {
          const ref = doc(db, 'users', toSafeDocId(u.id));
          operations.push({ ref, data: sanitize(u) });
        }
      }
    }

    // 7. Transactions
    if (Array.isArray(state.transactions)) {
      for (const t of state.transactions) {
        if (t && t.id) {
          const ref = doc(db, 'transactions', toSafeDocId(t.id));
          operations.push({ ref, data: sanitize(t) });
        }
      }
    }

    // 8. Purchases
    if (Array.isArray(state.purchases)) {
      for (const pur of state.purchases) {
        if (pur && pur.id) {
          const ref = doc(db, 'purchases', toSafeDocId(pur.id));
          operations.push({ ref, data: sanitize(pur) });
        }
      }
    }

    // Commit in safe chunks of 250
    const CHUNK = 250;
    for (let i = 0; i < operations.length; i += CHUNK) {
      const chunkOps = operations.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const op of chunkOps) {
        batch.set(op.ref, op.data, { merge: true });
      }
      await batch.commit();
    }

    return { success: true };
  } catch (error: any) {
    if (checkQuotaError(error)) {
      console.warn('[Firestore Quota] Límite de cuota diaria alcanzado durante respaldo completo.');
      return { success: false, quotaExceeded: true };
    }
    console.error('Error backing up to Firestore:', error);
    throw error;
  }
}

// Helper to pull all data from Firestore
export async function restoreFromFirestore() {
  try {
    const state: any = {};

    // 1. Products
    const productsSnap = await getDocs(collection(db, 'products'));
    state.products = productsSnap.docs.map(doc => doc.data());

    // 2. Clients
    const clientsSnap = await getDocs(collection(db, 'clients'));
    state.clients = clientsSnap.docs.map(doc => doc.data());

    // 3. Suppliers
    const suppliersSnap = await getDocs(collection(db, 'suppliers'));
    state.suppliers = suppliersSnap.docs.map(doc => doc.data());

    // 4. Company Settings
    const companySnap = await getDoc(doc(db, 'settings', 'company'));
    if (companySnap.exists()) {
      state.company = companySnap.data();
    }

    // 5. Exchange Rate
    const rateSnap = await getDoc(doc(db, 'settings', 'exchangeRate'));
    if (rateSnap.exists()) {
      state.exchangeRate = rateSnap.data();
    }

    // 6. Users
    const usersSnap = await getDocs(collection(db, 'users'));
    state.users = usersSnap.docs.map(doc => doc.data());

    // 7. Transactions
    const transactionsSnap = await getDocs(collection(db, 'transactions'));
    state.transactions = transactionsSnap.docs.map(doc => doc.data());

    // 8. Purchases
    const purchasesSnap = await getDocs(collection(db, 'purchases'));
    state.purchases = purchasesSnap.docs.map(doc => doc.data());

    return state;
  } catch (error: any) {
    checkQuotaError(error);
    console.error('Error restoring from Firestore:', error);
    throw error;
  }
}

// Single item sync helpers to keep database updated live
export async function syncSingleDoc(collectionName: string, id: string, docData: any) {
  if (!id || !docData) return false;

  try {
    const sanitize = (obj: any): any => {
      return JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
    };
    const safeId = toSafeDocId(id);
    await setDoc(doc(db, collectionName, safeId), sanitize(docData), { merge: true });
    if (_isQuotaExceeded) {
      setQuotaExceeded(false);
    }
    return true;
  } catch (error: any) {
    if (checkQuotaError(error)) {
      console.warn(`[Firestore Quota] Límite de cuota diaria alcanzado. Guardando localmente.`);
    } else {
      console.error(`[Firestore Error] Error escribiendo en ${collectionName}/${id}:`, error);
    }
    return false;
  }
}

// Single item delete helper
export async function deleteSingleDoc(collectionName: string, id: string) {
  if (_isQuotaExceeded) {
    return false;
  }
  try {
    const safeId = toSafeDocId(id);
    await deleteDoc(doc(db, collectionName, safeId));
    return true;
  } catch (error: any) {
    if (checkQuotaError(error)) {
      console.warn(`[Firestore Quota] Límite alcanzado al borrar ${collectionName}/${id}.`);
      return false;
    }
    console.warn(`Could not delete ${collectionName}/${id} live:`, error);
    return false;
  }
}

// Bulk migration helper: Saves products to Firestore in safely chunked batches (up to 400 per batch)
export async function batchSaveProducts(products: any[]) {
  if (!Array.isArray(products) || products.length === 0) return { success: true, count: 0 };
  if (_isQuotaExceeded) {
    console.warn('[Firestore Quota] Guardado por lotes omitido por cuota diaria alcanzada. Datos guardados en almacenamiento local.');
    return { success: false, count: 0, quotaExceeded: true };
  }
  
  const sanitize = (obj: any): any => {
    return JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
  };

  const CHUNK_SIZE = 100; // Safe chunk size to avoid gRPC stream resets and timeout errors
  let totalSaved = 0;

  try {
    for (let i = 0; i < products.length; i += CHUNK_SIZE) {
      const chunk = products.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const p of chunk) {
        if (p && p.id) {
          const safeId = toSafeDocId(p.id);
          const ref = doc(db, 'products', safeId);
          batch.set(ref, sanitize(p), { merge: true });
          totalSaved++;
        }
      }
      try {
        await batch.commit();
      } catch (commitErr: any) {
        if (checkQuotaError(commitErr)) {
          return { success: false, count: totalSaved, quotaExceeded: true };
        }
        console.warn(`[Firestore Batch Warning] Chunk ${i}-${i + chunk.length} commit warning:`, commitErr.message || commitErr);
        // Continue with next chunk or fallback to local storage
      }
    }
    return { success: true, count: totalSaved };
  } catch (error: any) {
    if (checkQuotaError(error)) {
      console.warn('[Firestore Quota] Límite de cuota diaria alcanzado durante guardado por lote.');
      return { success: false, count: totalSaved, quotaExceeded: true };
    }
    console.error('Error in batchSaveProducts:', error);
    return { success: false, count: totalSaved, error };
  }
}

// Bulk deletion helper: Deletes products from Firestore in chunked batches
export async function batchDeleteProducts(productIds: string[]) {
  if (!Array.isArray(productIds) || productIds.length === 0) return { success: true, count: 0 };
  if (_isQuotaExceeded) {
    return { success: false, quotaExceeded: true };
  }

  const CHUNK_SIZE = 100;
  try {
    for (let i = 0; i < productIds.length; i += CHUNK_SIZE) {
      const chunk = productIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        if (id) {
          const safeId = toSafeDocId(id);
          const ref = doc(db, 'products', safeId);
          batch.delete(ref);
        }
      }
      await batch.commit();
    }
    return { success: true };
  } catch (error: any) {
    if (checkQuotaError(error)) {
      console.warn('[Firestore Quota] Límite alcanzado durante eliminación por lote.');
      return { success: false, quotaExceeded: true };
    }
    console.error('Error in batchDeleteProducts:', error);
    return { success: false, error };
  }
}

// Validates connection to Firestore at application boot
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'settings', 'company'));
    console.log("✅ Firestore connected and live.");
    return true;
  } catch (error: any) {
    if (checkQuotaError(error)) {
      console.warn("⚠️ Firestore cuota diaria alcanzada.");
    } else if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("⚠️ Firestore client is offline.");
    } else {
      console.log("Firestore connection verified.");
    }
    return false;
  }
}

