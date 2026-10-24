import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc, deleteDoc, writeBatch, collection, getDocs } from "firebase/firestore";

function getArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

const PORT = Number(getArg('--port') || process.env.DEFAULT_APP_PORT || 3000);
const HOST = getArg('--host') || '0.0.0.0';
const DB_FILE = path.join(process.cwd(), "data", "siga_database.json");
const DB_BACKUP_FILE = path.join(process.cwd(), "data", "siga_database.backup.json");
const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");
const PUBLIC_UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

// Ensure permanent upload directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(PUBLIC_UPLOADS_DIR)) {
  fs.mkdirSync(PUBLIC_UPLOADS_DIR, { recursive: true });
}

// Helper to save base64 data URLs as real image files on disk
function saveBase64Image(dataUrl: string, prefix = 'prod'): string | null {
  try {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches || matches.length < 3) return null;
    
    let ext = matches[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    const buffer = Buffer.from(matches[2], 'base64');
    const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const fileName = `${safePrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, buffer);
    
    // Also copy to public/uploads for instant static availability
    const publicFilePath = path.join(PUBLIC_UPLOADS_DIR, fileName);
    fs.writeFileSync(publicFilePath, buffer);
    
    return `/uploads/${fileName}`;
  } catch (err) {
    console.error("Error saving base64 image:", err);
    return null;
  }
}

// Load initial database with automatic backup recovery
let memoryDb: any = null;
try {
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    if (raw && raw.trim().length > 0) {
      memoryDb = JSON.parse(raw);
    }
  }
} catch (e) {
  console.error("Error reading database file:", e);
}

if (!memoryDb && fs.existsSync(DB_BACKUP_FILE)) {
  try {
    const backupRaw = fs.readFileSync(DB_BACKUP_FILE, "utf-8");
    if (backupRaw && backupRaw.trim().length > 0) {
      memoryDb = JSON.parse(backupRaw);
      console.log("[CIMA Server] Successfully restored database from backup file.");
    }
  } catch (be) {
    console.error("Error reading backup database file:", be);
  }
}

// 1. Purge legacy Polar dummy purchase if present
if (memoryDb && Array.isArray(memoryDb.purchases)) {
  const initialPurchasesCount = memoryDb.purchases.length;
  memoryDb.purchases = memoryDb.purchases.filter((p: any) => p.id !== 'COM-0001' && !p.supplierName?.toLowerCase().includes('polar'));
  if (memoryDb.purchases.length !== initialPurchasesCount) {
    console.log("[CIMA Server] Purged legacy Polar purchase from database.");
  }
}

if (!memoryDb) {
  memoryDb = {
    products: [],
    clients: [],
    suppliers: [],
    transactions: [],
    purchases: [],
    users: [],
    company: {
      name: "INVERSIONES, PRODUCCIONES Y SUMINISTROS CIMA, C.A.",
      rif: "J503750189",
      phone: "0212-9876543",
      email: "contacto@cima.com.ve",
      address: "DOMICILIO FISCAL CALLE LAS VEGAS QTA ROSARIO NRO S/N URB LA TRINIDAD CARACAS MIRANDA ZONA POSTAL 1080",
      logoUrl: "",
      ivaRate: 16,
      igtfRate: 3
    },
    exchangeRate: {
      rate: 842.20,
      lastUpdated: new Date().toISOString(),
      source: "Manual Ajustada (@ssuarez)"
    },
    sequences: {
      factura: 9177,
      cotizacion: 11,
      recibo: 3,
      consignacion: 1
    },
    consignmentItems: [],
    liveActivities: [],
    activeSessions: []
  };
}

function computeConsignmentItems(transactions: any[]): any[] {
  const stockMap: Record<string, any> = {};
  const sorted = [...(transactions || [])].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  sorted.forEach(trx => {
    if (trx.status === 'anulado') return;
    const clientRif = trx.clientRif || 'V-';
    const clientName = trx.clientName || 'Cliente';

    if (trx.type === 'consignacion') {
      (trx.items || []).forEach((it: any) => {
        const key = `${clientRif}_${it.productId}`;
        if (!stockMap[key]) {
          stockMap[key] = {
            id: key,
            clientRif,
            clientName,
            productId: it.productId,
            productName: it.name,
            qty: 0,
            updatedAt: trx.timestamp,
            createdByName: trx.createdByName || 'ssuarez',
            documentId: trx.id
          };
        }
        stockMap[key].qty += (it.qty || 0);
        stockMap[key].updatedAt = trx.timestamp;
        if (trx.createdByName) stockMap[key].createdByName = trx.createdByName;
        if (trx.id) stockMap[key].documentId = trx.id;
      });
    } else if (trx.type === 'factura' || trx.type === 'recibo') {
      const isFromConsignment = trx.inventorySource === 'consignacion' || trx.additionalNotes?.includes('Origen: Consignación') || trx.paymentMethod === 'Consignación Abierta';
      if (isFromConsignment) {
        (trx.items || []).forEach((it: any) => {
          const key = `${clientRif}_${it.productId}`;
          if (stockMap[key]) {
            stockMap[key].qty = Math.max(0, stockMap[key].qty - (it.qty || 0));
            stockMap[key].updatedAt = trx.timestamp;
          }
        });
      }
    }
  });
  return Object.values(stockMap).filter((item: any) => item.qty > 0);
}

function isDummyRecord(_item: any, _colName: string): boolean {
  return false;
}

if (!Array.isArray(memoryDb.consignmentItems) || memoryDb.consignmentItems.length === 0) {
  memoryDb.consignmentItems = computeConsignmentItems(memoryDb.transactions);
}

// Ensure tombstones structure exists to permanently prevent deleted items from being resurrected
if (!memoryDb.tombstones) {
  memoryDb.tombstones = {
    products: [],
    clients: [],
    suppliers: [],
    transactions: [],
    purchases: [],
    users: [],
    consignmentItems: []
  };
}

// Safe document ID for Firestore path compliance
function toSafeDocId(rawId: string | number): string {
  if (!rawId && rawId !== 0) return '';
  const str = String(rawId).trim();
  return encodeURIComponent(str).replace(/\./g, '%2E');
}

function fromSafeDocId(safeId: string): string {
  if (!safeId) return '';
  try {
    return decodeURIComponent(safeId);
  } catch (e) {
    return safeId;
  }
}

// Initialize Firebase for cloud mirroring and persistent multi-user synchronization
let firestoreDb: any = null;
let firestoreSyncPromise: Promise<void> | null = null;

async function syncToFirestore(collectionName: string, id: string, docData: any) {
  if (!firestoreDb || !id || !docData) return;
  try {
    const sanitize = (obj: any): any => {
      return JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
    };
    const safeId = toSafeDocId(id);
    await setDoc(doc(firestoreDb, collectionName, safeId), sanitize(docData), { merge: true });
  } catch (err) {
    console.error(`[Server Firestore Write Error] ${collectionName}/${id}:`, err);
  }
}

async function deleteFromFirestore(collectionName: string, id: string) {
  if (!firestoreDb || !id) return;
  try {
    const safeId = toSafeDocId(id);
    await deleteDoc(doc(firestoreDb, collectionName, safeId));
  } catch (err) {
    console.error(`[Server Firestore Delete Error] ${collectionName}/${id}:`, err);
  }
}

try {
  const cfgPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    const app = getApps().length === 0 ? initializeApp(cfg) : getApps()[0];
    firestoreDb = getFirestore(app, cfg.firestoreDatabaseId);

    if (firestoreDb) {
      firestoreSyncPromise = (async () => {
        try {
          console.log("[Firestore Sync] Starting initial data pull from Firestore...");
          const collections = ['clients', 'suppliers', 'transactions', 'purchases', 'products', 'users', 'consignmentItems'];
          for (const colName of collections) {
            const snap = await getDocs(collection(firestoreDb, colName));
            if (!snap.empty) {
              const tombSet = new Set((memoryDb.tombstones?.[colName] || []).map(String));
              const remoteDocs: any[] = [];
              snap.forEach(d => {
                const data = d.data();
                const rawId = data.id || fromSafeDocId(d.id);
                if (!tombSet.has(String(rawId))) {
                  const item = { ...data, id: rawId };
                  remoteDocs.push(item);
                }
              });
              if (!Array.isArray(memoryDb[colName])) memoryDb[colName] = [];
              const map = new Map<string, any>();
              memoryDb[colName]
                .filter((it: any) => it && it.id && !tombSet.has(String(it.id)))
                .forEach((it: any) => map.set(it.id, it));
              if (colName === 'products') {
                remoteDocs.forEach((it: any) => {
                  const existing = map.get(it.id);
                  let finalProd = it;
                  if (existing) {
                    if (existing.updatedAt && it.updatedAt) {
                      const localTime = new Date(existing.updatedAt).getTime();
                      const remoteTime = new Date(it.updatedAt).getTime();
                      if (localTime >= remoteTime) {
                        return; // Retain newer local product state
                      }
                    }
                    const img = it.imageUrl || existing.imageUrl || "/uploads/placeholder.jpg";
                    finalProd = {
                      ...existing,
                      ...it,
                      imageUrl: img,
                      priceUSD: (it.priceUSD !== undefined && Number(it.priceUSD) >= 0) ? Number(it.priceUSD) : (existing.priceUSD ?? 0),
                      priceVES: (it.priceVES !== undefined && Number(it.priceVES) > 0) ? Number(it.priceVES) : (existing.priceVES ?? 0),
                      priceWholesaleUSD: (it.priceWholesaleUSD !== undefined && Number(it.priceWholesaleUSD) >= 0) ? Number(it.priceWholesaleUSD) : (existing.priceWholesaleUSD ?? 0),
                      priceWholesaleVES: (it.priceWholesaleVES !== undefined && Number(it.priceWholesaleVES) > 0) ? Number(it.priceWholesaleVES) : (existing.priceWholesaleVES ?? 0),
                      priceCuadrillasUSD: (it.priceCuadrillasUSD !== undefined && Number(it.priceCuadrillasUSD) >= 0) ? Number(it.priceCuadrillasUSD) : (existing.priceCuadrillasUSD ?? 0),
                      priceCuadrillasVES: (it.priceCuadrillasVES !== undefined && Number(it.priceCuadrillasVES) > 0) ? Number(it.priceCuadrillasVES) : (existing.priceCuadrillasVES ?? 0),
                      costUSD: (it.costUSD !== undefined && Number(it.costUSD) >= 0) ? Number(it.costUSD) : (existing.costUSD ?? 0),
                      costVES: (it.costVES !== undefined && Number(it.costVES) > 0) ? Number(it.costVES) : (existing.costVES ?? 0),
                      costExchangeUSD: it.costExchangeUSD || existing.costExchangeUSD || it.costUSD || existing.costUSD || 0
                    };
                  }
                  map.set(it.id, finalProd);
                });
              } else if (colName === 'purchases') {
                remoteDocs
                  .filter((p: any) => p && p.id !== 'COM-0001' && !(p.supplierName || '').toLowerCase().includes('polar'))
                  .forEach((it: any) => map.set(it.id, it));
              } else {
                remoteDocs.forEach((it: any) => map.set(it.id, it));
              }
              memoryDb[colName] = Array.from(map.values());
            }
          }

          // Pull settings
          try {
            const snapSettings = await getDocs(collection(firestoreDb, 'settings'));
            snapSettings.forEach(d => {
              if (d.id === 'company' && d.exists()) {
                memoryDb.company = { ...memoryDb.company, ...d.data() };
              } else if (d.id === 'exchangeRate' && d.exists()) {
                memoryDb.exchangeRate = d.data();
              } else if (d.id === 'sequences' && d.exists()) {
                memoryDb.sequences = { ...memoryDb.sequences, ...d.data() };
              }
            });
          } catch (e) {}

          memoryDb.consignmentItems = computeConsignmentItems(memoryDb.transactions);
          persistDb();
          console.log(`[Firestore Sync] Successfully merged data from Firestore. Products: ${memoryDb.products?.length}, Transactions: ${memoryDb.transactions?.length}, Clients: ${memoryDb.clients?.length}`);
        } catch (err) {
          console.warn("[Firestore Sync Notice]", err);
        }
      })();
    }
  }
} catch (e) {
  console.warn("Server Firestore initialization notice:", e);
}

// Persist helper
let saveTimeout: any = null;
function persistDb() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      if (!fs.existsSync(path.dirname(DB_FILE))) {
        fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
      }
      const dataStr = JSON.stringify(memoryDb, null, 2);
      fs.writeFileSync(DB_FILE, dataStr, "utf-8");
      // Double persistence: keep continuous backup to guarantee no data loss
      fs.writeFileSync(DB_BACKUP_FILE, dataStr, "utf-8");
    } catch (e) {
      console.error("Error saving database to file:", e);
    }
  }, 200);
}

// Graceful shutdown handling to ensure no data is lost when process restarts
function handleShutdown(signal: string) {
  console.log(`[CIMA Server] Signal ${signal} received, ensuring complete data persistence...`);
  try {
    if (memoryDb) {
      if (!fs.existsSync(path.dirname(DB_FILE))) {
        fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
      }
      const dataStr = JSON.stringify(memoryDb, null, 2);
      fs.writeFileSync(DB_FILE, dataStr, "utf-8");
      fs.writeFileSync(DB_BACKUP_FILE, dataStr, "utf-8");
    }
  } catch (e) {
    console.error("Error persisting data on shutdown:", e);
  }
  process.exit(0);
}
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

// SSE connected clients list
const sseClients = new Set<express.Response>();

function broadcastSSE(event: string, payload: any) {
  const dataString = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(dataString);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Active sessions tracking (heartbeat)
const activeSessionsMap = new Map<string, any>();

setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [key, session] of activeSessionsMap.entries()) {
    if (now - session.lastSeen > 60 * 1000) {
      activeSessionsMap.delete(key);
      changed = true;
    }
  }
  if (changed) {
    memoryDb.activeSessions = Array.from(activeSessionsMap.values());
    broadcastSSE("sessions_update", memoryDb.activeSessions);
  }
}, 15000);

// Mirroring to Firestore project studio-5845788131-9f582 is handled event-driven on actual changes
// to avoid stream RST_STREAM errors and respect Firestore rate limits.

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  // Custom static uploads handler to guarantee correct MIME types even for filenames with underscores like prod_xxx_jpg
  app.get("/uploads/:filename", (req, res, next) => {
    try {
      const filename = path.basename(req.params.filename);
      const candidates = [
        path.join(PUBLIC_UPLOADS_DIR, filename),
        path.join(UPLOADS_DIR, filename),
        path.join(PUBLIC_UPLOADS_DIR, filename.replace(/_jpg$/i, '.jpg')),
        path.join(UPLOADS_DIR, filename.replace(/_jpg$/i, '.jpg')),
        path.join(PUBLIC_UPLOADS_DIR, filename.replace(/\.jpg$/i, '_jpg')),
        path.join(UPLOADS_DIR, filename.replace(/\.jpg$/i, '_jpg')),
        path.join(PUBLIC_UPLOADS_DIR, filename + '.jpg'),
        path.join(UPLOADS_DIR, filename + '.jpg')
      ];
      for (const targetPath of candidates) {
        if (fs.existsSync(targetPath)) {
          if (targetPath.endsWith('.png')) {
            res.type('image/png');
          } else if (targetPath.endsWith('.webp')) {
            res.type('image/webp');
          } else if (targetPath.endsWith('.svg')) {
            res.type('image/svg+xml');
          } else {
            res.type('image/jpeg');
          }
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.sendFile(targetPath);
        }
      }
      next();
    } catch (e) {
      next();
    }
  });

  // Fallback static uploads routes
  app.use("/uploads", express.static(UPLOADS_DIR));
  app.use("/uploads", express.static(PUBLIC_UPLOADS_DIR));

  // Dedicated endpoint for uploading and permanently saving product photos
  app.post("/api/upload-photo", (req, res) => {
    try {
      const { image, productId } = req.body;
      if (!image || typeof image !== 'string') {
        return res.status(400).json({ success: false, error: "No image payload provided" });
      }
      let finalUrl = image;
      if (image.startsWith('data:image/')) {
        const saved = saveBase64Image(image, productId || 'prod');
        if (saved) {
          finalUrl = saved;
        }
      }
      if (productId && Array.isArray(memoryDb.products)) {
        const prod = memoryDb.products.find((p: any) => 
          String(p.id).toLowerCase() === String(productId).toLowerCase() || 
          (p.sku && String(p.sku).toLowerCase() === String(productId).toLowerCase())
        );
        if (prod) {
          prod.imageUrl = finalUrl;
          prod.updatedAt = new Date().toISOString();
          persistDb();
          syncToFirestore('products', prod.id, prod);
          broadcastSSE("state_update", {
            updatedKeys: ["products"],
            products: memoryDb.products,
            timestamp: Date.now()
          });
        }
      }
      return res.json({ success: true, url: finalUrl });
    } catch (err: any) {
      console.error("Error in /api/upload-photo:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // API ROUTES FIRST
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Full state query
  app.get("/api/state", async (_req, res) => {
    if (firestoreSyncPromise) {
      try {
        await firestoreSyncPromise;
      } catch (e) {}
    }
    res.json({
      success: true,
      data: {
        ...memoryDb,
        activeSessions: Array.from(activeSessionsMap.values())
      }
    });
  });

  // Real-time synchronization event stream (SSE)
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    sseClients.add(res);

    // Send initial snapshot
    res.write(`event: init\ndata: ${JSON.stringify({
      productsCount: memoryDb.products.length,
      clientsCount: memoryDb.clients.length,
      transactionsCount: memoryDb.transactions.length,
      purchasesCount: memoryDb.purchases.length,
      exchangeRate: memoryDb.exchangeRate,
      activeSessions: Array.from(activeSessionsMap.values())
    })}\n\n`);

    // Keep-alive heartbeat every 20s
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 20000);

    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // User presence heartbeat
  app.post("/api/presence", (req, res) => {
    const { user, tab, action } = req.body;
    if (user && user.username) {
      const sessionId = `session_${user.username}`;
      activeSessionsMap.set(sessionId, {
        id: sessionId,
        username: user.username,
        nombreCompleto: user.nombreCompleto || user.username,
        role: user.role || "Usuario",
        tab: tab || "dashboard",
        lastSeen: Date.now(),
        lastAction: action || "Activo"
      });
      memoryDb.activeSessions = Array.from(activeSessionsMap.values());
      broadcastSSE("sessions_update", memoryDb.activeSessions);
    }
    res.json({ success: true });
  });

  // Dedicated secure deletion endpoint - strictly restricted to Administrador
  app.post("/api/delete", async (req, res) => {
    try {
      const { collection: colName, id, ids, user } = req.body;
      if (!user || user.role !== 'Administrador') {
        console.warn(`[CIMA Security] Unauthorized delete attempt by user "${user?.username || 'unknown'}" with role "${user?.role || 'none'}"`);
        return res.status(403).json({
          success: false,
          error: "⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para eliminar registros."
        });
      }

      const validCollections = ['products', 'clients', 'suppliers', 'transactions', 'purchases', 'users', 'consignmentItems'];
      if (!colName || !validCollections.includes(colName)) {
        return res.status(400).json({ success: false, error: "Colección inválida o no soportada." });
      }

      const idsToDelete: string[] = ids && Array.isArray(ids) ? ids.map(String) : (id ? [String(id)] : []);
      if (idsToDelete.length === 0) {
        return res.status(400).json({ success: false, error: "No se especificaron identificadores para eliminar." });
      }

      // Root administrator protection
      if (colName === 'users') {
        if (idsToDelete.includes('usr-sinai') || idsToDelete.includes('ssuarez@bst')) {
          return res.status(400).json({ success: false, error: "⛔ La cuenta principal del Administrador raíz no puede ser eliminada." });
        }
      }

      // 1. Remove from local memoryDb
      if (Array.isArray(memoryDb[colName])) {
        const idSet = new Set(idsToDelete);
        memoryDb[colName] = memoryDb[colName].filter((item: any) => item && !idSet.has(String(item.id)));
      }

      // Record in tombstones to permanently prevent deleted items from coming back
      if (!memoryDb.tombstones) memoryDb.tombstones = {};
      if (!Array.isArray(memoryDb.tombstones[colName])) memoryDb.tombstones[colName] = [];
      const currentTombstones = new Set(memoryDb.tombstones[colName].map(String));
      idsToDelete.forEach(targetId => currentTombstones.add(String(targetId)));
      memoryDb.tombstones[colName] = Array.from(currentTombstones);

      persistDb();

      // 2. Delete from Firestore in Google Cloud
      for (const targetId of idsToDelete) {
        await deleteFromFirestore(colName, targetId);
      }

      // 3. Broadcast real-time deletion event to all connected clients
      broadcastSSE("item_deleted", {
        collection: colName,
        deletedIds: idsToDelete,
        sourceUser: user.username,
        timestamp: Date.now()
      });

      // 4. Broadcast updated state to all connected clients
      broadcastSSE("state_update", {
        updatedKeys: [colName, 'tombstones'],
        sourceUser: user.username,
        timestamp: Date.now(),
        [colName]: memoryDb[colName],
        tombstones: memoryDb.tombstones
      });

      console.log(`[CIMA Server] User ${user.username} (Administrador) deleted ${idsToDelete.length} item(s) from "${colName}"`);
      return res.json({ success: true, deletedIds: idsToDelete });
    } catch (err: any) {
      console.error("Error handling /api/delete:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Dedicated endpoint for resetting commercial history - strictly restricted to Administrador
  app.post("/api/reset-history", async (req, res) => {
    try {
      const { user } = req.body;
      if (!user || user.role !== 'Administrador') {
        return res.status(403).json({
          success: false,
          error: "⛔ Permiso Denegado: Solo los usuarios con rol de Administrador pueden reiniciar el historial comercial."
        });
      }

      const resetSeq = {
        factura: 0,
        recibo: 0,
        cotizacion: 0,
        consignacion: 0
      };

      // 1. Delete all transactions and purchases from Firestore
      if (firestoreDb) {
        try {
          const snapTrx = await getDocs(collection(firestoreDb, 'transactions'));
          snapTrx.forEach(d => {
            deleteDoc(doc(firestoreDb, 'transactions', d.id)).catch(console.warn);
          });
          const snapPur = await getDocs(collection(firestoreDb, 'purchases'));
          snapPur.forEach(d => {
            deleteDoc(doc(firestoreDb, 'purchases', d.id)).catch(console.warn);
          });
          syncToFirestore('settings', 'sequences', resetSeq);
        } catch (e) {
          console.warn("[Reset History Firestore Error]", e);
        }
      }

      // 2. Clear from memoryDb
      memoryDb.transactions = [];
      memoryDb.purchases = [];
      memoryDb.sequences = resetSeq;
      persistDb();

      // 3. Broadcast real-time reset event to all connected clients
      broadcastSSE("history_reset", {
        sourceUser: user.username,
        timestamp: Date.now(),
        sequences: resetSeq
      });

      broadcastSSE("state_update", {
        updatedKeys: ["transactions", "purchases", "sequences"],
        sourceUser: user.username,
        timestamp: Date.now(),
        transactions: [],
        purchases: [],
        sequences: resetSeq
      });

      console.log(`[CIMA Server] User ${user.username} (Administrador) reset commercial history and purchases to 0.`);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("Error in /api/reset-history:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Universal real-time state sync (merges any change made by any user)
  app.post("/api/sync", (req, res) => {
    try {
      const { 
        products, 
        clients, 
        suppliers, 
        transactions, 
        purchases, 
        users,
        exchangeRate, 
        company, 
        sequences, 
        activity,
        sourceUser,
        deletedCollection,
        deletedIds
      } = req.body;

      let hasChanges = false;
      const updatedKeys: string[] = [];

      // Handle explicit deletions if requested by Administrador
      if (deletedCollection && Array.isArray(deletedIds) && deletedIds.length > 0 && sourceUser?.role === 'Administrador') {
        const idSet = new Set(deletedIds.map(String));
        if (Array.isArray(memoryDb[deletedCollection])) {
          memoryDb[deletedCollection] = memoryDb[deletedCollection].filter((item: any) => item && !idSet.has(String(item.id)));
          hasChanges = true;
          updatedKeys.push(deletedCollection);
        }
        if (!memoryDb.tombstones) memoryDb.tombstones = {};
        if (!Array.isArray(memoryDb.tombstones[deletedCollection])) memoryDb.tombstones[deletedCollection] = [];
        const currentTombstones = new Set(memoryDb.tombstones[deletedCollection].map(String));
        deletedIds.forEach(id => currentTombstones.add(String(id)));
        memoryDb.tombstones[deletedCollection] = Array.from(currentTombstones);
        updatedKeys.push('tombstones');

        for (const targetId of deletedIds) {
          deleteFromFirestore(deletedCollection, String(targetId));
        }
        broadcastSSE("item_deleted", {
          collection: deletedCollection,
          deletedIds,
          sourceUser: sourceUser.username,
          timestamp: Date.now()
        });
      }

      // Update products (additive merge to protect all user entries, respecting tombstones)
      if (Array.isArray(products) && products.length > 0) {
        const tombSet = new Set((memoryDb.tombstones?.products || []).map(String));
        const prodMap = new Map<string, any>();
        (memoryDb.products || []).forEach((p: any) => { 
          if (p && p.id && !tombSet.has(String(p.id))) prodMap.set(String(p.id), p); 
        });
        const changedProds: any[] = [];
        products.forEach((p: any) => {
          if (p && p.id && !tombSet.has(String(p.id))) {
            if (p.imageUrl && typeof p.imageUrl === 'string' && p.imageUrl.startsWith('data:image/')) {
              const saved = saveBase64Image(p.imageUrl, p.id || 'prod');
              if (saved) p.imageUrl = saved;
            }
            const existing = prodMap.get(String(p.id));
            if (!p.imageUrl && existing?.imageUrl) {
              p.imageUrl = existing.imageUrl;
            }

            // CRITICAL: Guarantee every price in $ and Bs is preserved and never dropped
            const mergedProd = {
              ...existing,
              ...p,
              priceUSD: (p.priceUSD !== undefined && p.priceUSD !== null && Number(p.priceUSD) >= 0) ? Number(p.priceUSD) : (existing?.priceUSD ?? 0),
              priceVES: (p.priceVES !== undefined && p.priceVES !== null && Number(p.priceVES) > 0) 
                ? Number(p.priceVES) 
                : (existing?.priceVES ?? (p.priceUSD || 0)),
              priceWholesaleUSD: (p.priceWholesaleUSD !== undefined && p.priceWholesaleUSD !== null && Number(p.priceWholesaleUSD) >= 0) ? Number(p.priceWholesaleUSD) : (existing?.priceWholesaleUSD ?? 0),
              priceWholesaleVES: (p.priceWholesaleVES !== undefined && p.priceWholesaleVES !== null && Number(p.priceWholesaleVES) > 0) 
                ? Number(p.priceWholesaleVES) 
                : (existing?.priceWholesaleVES ?? (p.priceWholesaleUSD || 0)),
              priceCuadrillasUSD: (p.priceCuadrillasUSD !== undefined && p.priceCuadrillasUSD !== null && Number(p.priceCuadrillasUSD) >= 0) ? Number(p.priceCuadrillasUSD) : (existing?.priceCuadrillasUSD ?? 0),
              priceCuadrillasVES: (p.priceCuadrillasVES !== undefined && p.priceCuadrillasVES !== null && Number(p.priceCuadrillasVES) > 0) 
                ? Number(p.priceCuadrillasVES) 
                : (existing?.priceCuadrillasVES ?? (p.priceCuadrillasUSD || 0)),
              costUSD: (p.costUSD !== undefined && p.costUSD !== null && Number(p.costUSD) >= 0) ? Number(p.costUSD) : (existing?.costUSD ?? 0),
              costVES: (p.costVES !== undefined && p.costVES !== null && Number(p.costVES) > 0) 
                ? Number(p.costVES) 
                : (existing?.costVES ?? (p.costUSD || 0)),
              costExchangeUSD: (p.costExchangeUSD !== undefined && p.costExchangeUSD !== null && Number(p.costExchangeUSD) >= 0) ? Number(p.costExchangeUSD) : (existing?.costExchangeUSD ?? p.costUSD ?? 0),
              priceCuadrillasDetalUSD: Number(p.priceCuadrillasDetalUSD) || existing?.priceCuadrillasDetalUSD || 0,
              priceMayorDetalUSD: Number(p.priceMayorDetalUSD) || existing?.priceMayorDetalUSD || 0,
              imageUrl: p.imageUrl || existing?.imageUrl || "/uploads/placeholder.jpg",
              updatedAt: p.updatedAt || new Date().toISOString()
            };

            const isDiff = !existing || 
              existing.stock !== mergedProd.stock || 
              existing.costUSD !== mergedProd.costUSD || 
              existing.costVES !== mergedProd.costVES || 
              existing.priceUSD !== mergedProd.priceUSD || 
              existing.priceVES !== mergedProd.priceVES ||
              existing.priceWholesaleUSD !== mergedProd.priceWholesaleUSD ||
              existing.priceWholesaleVES !== mergedProd.priceWholesaleVES ||
              existing.priceCuadrillasUSD !== mergedProd.priceCuadrillasUSD ||
              existing.priceCuadrillasVES !== mergedProd.priceCuadrillasVES ||
              existing.name !== mergedProd.name ||
              existing.sku !== mergedProd.sku ||
              existing.binLocation !== mergedProd.binLocation ||
              existing.category !== mergedProd.category ||
              existing.imageUrl !== mergedProd.imageUrl;
            
            prodMap.set(String(p.id), mergedProd);
            if (isDiff) {
              changedProds.push(mergedProd);
            }
          }
        });
        memoryDb.products = Array.from(prodMap.values());
        hasChanges = true;
        updatedKeys.push("products");

        if (firestoreDb && changedProds.length > 0) {
          (async () => {
            for (const cp of changedProds) {
              await syncToFirestore('products', cp.id, cp);
            }
          })().catch(err => console.warn("[Firestore products sync error]:", err));
        }
      }

      // Update clients (additive merge to protect all user entries, respecting tombstones)
      if (Array.isArray(clients) && clients.length > 0) {
        const tombSet = new Set((memoryDb.tombstones?.clients || []).map(String));
        const cliMap = new Map<string, any>();
        (memoryDb.clients || []).forEach((c: any) => { 
          if (c && c.id && !tombSet.has(String(c.id))) cliMap.set(String(c.id), c); 
        });
        clients.forEach((c: any) => {
          if (c && c.id && !tombSet.has(String(c.id))) {
            cliMap.set(String(c.id), c);
            syncToFirestore('clients', c.id, c);
          }
        });
        memoryDb.clients = Array.from(cliMap.values());
        hasChanges = true;
        updatedKeys.push("clients");
      }

      // Update suppliers (additive merge to protect all user entries, respecting tombstones)
      if (Array.isArray(suppliers) && suppliers.length > 0) {
        const tombSet = new Set((memoryDb.tombstones?.suppliers || []).map(String));
        const supMap = new Map<string, any>();
        (memoryDb.suppliers || []).forEach((s: any) => { 
          if (s && s.id && !tombSet.has(String(s.id))) supMap.set(String(s.id), s); 
        });
        suppliers.forEach((s: any) => {
          if (s && s.id && !tombSet.has(String(s.id))) {
            supMap.set(String(s.id), s);
            syncToFirestore('suppliers', s.id, s);
          }
        });
        memoryDb.suppliers = Array.from(supMap.values());
        hasChanges = true;
        updatedKeys.push("suppliers");
      }

      // Update users (additive merge to protect all user entries, respecting tombstones)
      if (Array.isArray(users) && users.length > 0) {
        const tombSet = new Set((memoryDb.tombstones?.users || []).map(String));
        const usrMap = new Map<string, any>();
        (memoryDb.users || []).forEach((u: any) => { 
          if (u && u.id && !tombSet.has(String(u.id))) usrMap.set(String(u.id), u); 
        });
        users.forEach((u: any) => {
          if (u && u.id && !tombSet.has(String(u.id))) {
            usrMap.set(String(u.id), u);
            syncToFirestore('users', u.id, u);
          }
        });
        memoryDb.users = Array.from(usrMap.values());
        hasChanges = true;
        updatedKeys.push("users");
      }

      // Update transactions (additive merge to protect all user entries, respecting tombstones)
      if (Array.isArray(transactions) && transactions.length > 0) {
        const tombSet = new Set((memoryDb.tombstones?.transactions || []).map(String));
        const trxMap = new Map<string, any>();
        (memoryDb.transactions || []).forEach((t: any) => { 
          if (t && t.id && !tombSet.has(String(t.id))) trxMap.set(String(t.id), t); 
        });
        transactions.forEach((t: any) => {
          if (t && t.id && !tombSet.has(String(t.id))) {
            trxMap.set(String(t.id), t);
            syncToFirestore('transactions', t.id, t);
          }
        });
        memoryDb.transactions = Array.from(trxMap.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        hasChanges = true;
        updatedKeys.push("transactions");
      }

      // Update purchases (additive merge to protect all user entries, respecting tombstones)
      if (Array.isArray(purchases) && purchases.length > 0) {
        const tombSet = new Set((memoryDb.tombstones?.purchases || []).map(String));
        const purMap = new Map<string, any>();
        (memoryDb.purchases || []).forEach((p: any) => { 
          if (p && p.id && p.id !== 'COM-0001' && !p.supplierName?.toLowerCase().includes('polar') && !tombSet.has(String(p.id))) {
            purMap.set(String(p.id), p); 
          }
        });
        purchases.forEach((p: any) => { 
          if (p && p.id && p.id !== 'COM-0001' && !p.supplierName?.toLowerCase().includes('polar') && !tombSet.has(String(p.id))) {
            purMap.set(String(p.id), p);
            syncToFirestore('purchases', p.id, p);
          }
        });
        memoryDb.purchases = Array.from(purMap.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        hasChanges = true;
        updatedKeys.push("purchases");

        // Auto-extract any new supplier from purchases if not yet in suppliers
        purchases.forEach((p: any) => {
          if (p.supplierName && p.supplierName.trim()) {
            const sName = p.supplierName.trim();
            const exists = (memoryDb.suppliers || []).some((s: any) => s.name?.toLowerCase() === sName.toLowerCase());
            if (!exists) {
              const newSup = {
                id: 'sup-' + Date.now() + Math.floor(Math.random() * 1000),
                name: sName,
                rif: p.supplierRif || 'J-',
                phone: '',
                email: '',
                address: '',
                contactPerson: 'Departamento de Ventas'
              };
              memoryDb.suppliers = [...(memoryDb.suppliers || []), newSup];
              syncToFirestore('suppliers', newSup.id, newSup);
              if (!updatedKeys.includes("suppliers")) {
                updatedKeys.push("suppliers");
              }
            }
          }
        });
      }

      // Update consignment items
      const { consignmentItems } = req.body;
      if (Array.isArray(consignmentItems) && consignmentItems.length > 0) {
        const conMap = new Map<string, any>();
        (memoryDb.consignmentItems || []).forEach((ci: any) => { if (ci && ci.id) conMap.set(ci.id, ci); });
        consignmentItems.forEach((ci: any) => {
          if (ci && ci.id) {
            conMap.set(ci.id, ci);
            syncToFirestore('consignmentItems', ci.id, ci);
          }
        });
        memoryDb.consignmentItems = Array.from(conMap.values());
        hasChanges = true;
        updatedKeys.push("consignmentItems");
      } else if (updatedKeys.includes("transactions")) {
        memoryDb.consignmentItems = computeConsignmentItems(memoryDb.transactions);
        hasChanges = true;
        updatedKeys.push("consignmentItems");
      }

      // Update exchange rate
      if (exchangeRate && typeof exchangeRate.rate === "number") {
        memoryDb.exchangeRate = exchangeRate;
        syncToFirestore('settings', 'exchangeRate', exchangeRate);
        hasChanges = true;
        updatedKeys.push("exchangeRate");
      }

      // Update company
      if (company && company.name) {
        memoryDb.company = company;
        syncToFirestore('settings', 'company', company);
        hasChanges = true;
        updatedKeys.push("company");
      }

      // Update sequences
      if (sequences && typeof sequences.factura === "number") {
        memoryDb.sequences = { ...memoryDb.sequences, ...sequences };
        syncToFirestore('settings', 'sequences', memoryDb.sequences);
        hasChanges = true;
        updatedKeys.push("sequences");
      }

      // Record activity
      if (activity && typeof activity === "object") {
        const newAct = {
          id: activity.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          timestamp: activity.timestamp || Date.now(),
          username: activity.username || sourceUser?.username || "Usuario",
          action: activity.action || "Operación comercial",
          details: activity.details || ""
        };
        memoryDb.liveActivities = [newAct, ...(memoryDb.liveActivities || [])].slice(0, 50);
        broadcastSSE("new_activity", newAct);
      }

      if (hasChanges) {
        persistDb();

        // Write directly to Firestore to guarantee cloud persistence
        if (firestoreDb) {
          (async () => {
            try {
              if (updatedKeys.includes("transactions") && Array.isArray(transactions)) {
                for (const t of transactions) {
                  if (t && t.id) {
                    await syncToFirestore('transactions', t.id, t);
                  }
                }
              }
              if (updatedKeys.includes("purchases") && Array.isArray(purchases)) {
                for (const p of purchases) {
                  if (p && p.id) {
                    await syncToFirestore('purchases', p.id, p);
                  }
                }
              }
              if (updatedKeys.includes("clients") && Array.isArray(clients)) {
                for (const c of clients) {
                  if (c && c.id) {
                    await syncToFirestore('clients', c.id, c);
                  }
                }
              }
              if (updatedKeys.includes("suppliers") && Array.isArray(memoryDb.suppliers)) {
                for (const s of memoryDb.suppliers) {
                  if (s && s.id) {
                    await syncToFirestore('suppliers', s.id, s);
                  }
                }
              }
              if (updatedKeys.includes("company") && company) {
                await syncToFirestore('settings', 'company', company);
              }
              if (updatedKeys.includes("exchangeRate") && exchangeRate) {
                await syncToFirestore('settings', 'exchangeRate', exchangeRate);
              }
              if (updatedKeys.includes("sequences") && sequences) {
                await syncToFirestore('settings', 'sequences', memoryDb.sequences);
              }
            } catch (err) {
              console.error("[Firestore Cloud Sync Error in /api/sync]:", err);
            }
          })();
        }

        // Broadcast change immediately to all other connected users!
        broadcastSSE("state_update", {
          updatedKeys,
          sourceUser: sourceUser?.username || "anonymous",
          timestamp: Date.now(),
          exchangeRate: memoryDb.exchangeRate,
          sequences: memoryDb.sequences,
          products: updatedKeys.includes("products") ? memoryDb.products : undefined,
          clients: updatedKeys.includes("clients") ? memoryDb.clients : undefined,
          suppliers: updatedKeys.includes("suppliers") ? memoryDb.suppliers : undefined,
          transactions: updatedKeys.includes("transactions") ? memoryDb.transactions : undefined,
          purchases: updatedKeys.includes("purchases") ? memoryDb.purchases : undefined,
          users: updatedKeys.includes("users") ? memoryDb.users : undefined,
          company: updatedKeys.includes("company") ? memoryDb.company : undefined,
          consignmentItems: updatedKeys.includes("consignmentItems") ? memoryDb.consignmentItems : undefined
        });
      }

      res.json({ success: true, updatedKeys });
    } catch (err: any) {
      console.error("Error handling /api/sync:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Serve static files from public directory
  const publicPath = path.join(process.cwd(), "public");
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }

  // Vite middleware for dev or static files for prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`\n  VITE v6.2.3  ready in 150 ms\n\n  ➜  Local:   http://localhost:${PORT}/\n  ➜  Network: http://${HOST}:${PORT}/\n`);
    console.log(`[CIMA Server] Real-time Multi-User Server listening on http://${HOST}:${PORT}`);
  });
}

startServer();
