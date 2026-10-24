/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  loadDB, 
  saveDB, 
  INITIAL_USERS, 
  INITIAL_COMPANY
} from './data';
import { Product, ExchangeRate, User, Transaction, Purchase, Client, Supplier, CompanySettings, SyncLog, ConsignmentItem } from './types';

// Firebase Integrations
import { onSnapshot, collection, doc, deleteDoc, setDoc, getDocs, getDoc } from 'firebase/firestore';
import { 
  db, 
  syncSingleDoc, 
  deleteSingleDoc, 
  batchSaveProducts, 
  batchDeleteProducts, 
  testFirestoreConnection, 
  toSafeDocId, 
  fromSafeDocId,
  isQuotaExceeded,
  checkQuotaError,
  onQuotaExceededChange
} from './lib/firebase';

// Components
import Dashboard from './components/Dashboard';
import BillingModule from './components/BillingModule';
import InventoryModule from './components/InventoryModule';
import PurchasesModule from './components/PurchasesModule';
import ClientsModule from './components/ClientsModule';
import SuppliersModule from './components/SuppliersModule';
import HistoricoModule from './components/HistoricoModule';
import AnalyticsModule from './components/AnalyticsModule';
import SettingsModule from './components/SettingsModule';
import ScannerModal from './components/ScannerModal';
import LoginModule from './components/LoginModule';
import StaffModule from './components/StaffModule';
import AboutModule from './components/AboutModule';

export default function App() {
  // Load State from offline cache
  const [dbState, setDbState] = useState(() => loadDB());

  const [products, setProducts] = useState<Product[]>(dbState.products);
  const [clients, setClients] = useState<Client[]>(dbState.clients);
  const [suppliers, setSuppliers] = useState<Supplier[]>(dbState.suppliers || []);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate>(dbState.exchangeRate);
  const [currentUser, setCurrentUser] = useState<User>(dbState.currentUser);
  const [transactions, setTransactions] = useState<Transaction[]>(dbState.transactions);
  const [purchases, setPurchases] = useState<Purchase[]>(dbState.purchases);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>(dbState.syncLogs);
  const [isOnline, setIsOnline] = useState<boolean>(dbState.isOnline);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(dbState.company);
  const [users, setUsers] = useState<User[]>(dbState.users);

  // Sequences state (tracked across all clients in real-time)
  const [sequences, setSequences] = useState<Record<string, number>>(() => {
    const cached = localStorage.getItem('siga_sequences');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return {
      factura: 0,
      recibo: 0,
      cotizacion: 0,
      consignacion: 0
    };
  });

  useEffect(() => {
    localStorage.setItem('siga_sequences', JSON.stringify(sequences));
  }, [sequences]);

  // Quota exceeded state tracking
  const [quotaExceeded, setQuotaExceededState] = useState<boolean>(isQuotaExceeded());

  useEffect(() => {
    const unsub = onQuotaExceededChange((exceeded) => {
      setQuotaExceededState(exceeded);
    });
    return unsub;
  }, []);

  // Enforce/Migrate CIMA corporate details on app startup (safely once, local first)
  useEffect(() => {
    const cachedCompany = localStorage.getItem('siga_company');
    if (!cachedCompany) {
      setCompanySettings(INITIAL_COMPANY);
      localStorage.setItem('siga_company', JSON.stringify(INITIAL_COMPANY));
    }
  }, []);

  // Presence and shared live activities
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [liveActivities, setLiveActivities] = useState<any[]>([]);

  // Real-time server sync helper
  const notifyServerSync = (partial: any) => {
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...partial,
        sourceUser: currentUser
      })
    }).catch(err => console.warn('Server sync note:', err));
  };

  // 1. Initial State Fetch from central server (/api/state) & SSE real-time stream (/api/events)
  useEffect(() => {
    let eventSource: EventSource | null = null;

    async function loadServerState() {
      try {
        const res = await fetch('/api/state');
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            const data = json.data;
            const tombstones = data.tombstones || {};

            if (Array.isArray(data.products) && data.products.length > 0) {
              setProducts(prev => {
                const tombSet = new Set((tombstones.products || []).map(String));
                const prevMap = new Map<string, Product>();
                prev.forEach(p => {
                  if (p && p.id) prevMap.set(String(p.id), p);
                });
                const cleanProducts = data.products
                  .filter((p: Product) => p && p.id && !tombSet.has(String(p.id)))
                  .map((p: Product) => {
                    const local = prevMap.get(String(p.id));
                    return {
                      ...local,
                      ...p,
                      imageUrl: p.imageUrl || local?.imageUrl,
                      priceUSD: (p.priceUSD !== undefined && Number(p.priceUSD) >= 0) ? Number(p.priceUSD) : (local?.priceUSD ?? 0),
                      priceVES: (p.priceVES !== undefined && Number(p.priceVES) > 0) ? Number(p.priceVES) : (local?.priceVES ?? (p.priceUSD || 0)),
                      priceWholesaleUSD: (p.priceWholesaleUSD !== undefined && Number(p.priceWholesaleUSD) >= 0) ? Number(p.priceWholesaleUSD) : (local?.priceWholesaleUSD ?? 0),
                      priceWholesaleVES: (p.priceWholesaleVES !== undefined && Number(p.priceWholesaleVES) > 0) ? Number(p.priceWholesaleVES) : (local?.priceWholesaleVES ?? (p.priceWholesaleUSD || 0)),
                      priceCuadrillasUSD: (p.priceCuadrillasUSD !== undefined && Number(p.priceCuadrillasUSD) >= 0) ? Number(p.priceCuadrillasUSD) : (local?.priceCuadrillasUSD ?? 0),
                      priceCuadrillasVES: (p.priceCuadrillasVES !== undefined && Number(p.priceCuadrillasVES) > 0) ? Number(p.priceCuadrillasVES) : (local?.priceCuadrillasVES ?? (p.priceCuadrillasUSD || 0)),
                      costUSD: (p.costUSD !== undefined && Number(p.costUSD) >= 0) ? Number(p.costUSD) : (local?.costUSD ?? 0),
                      costVES: (p.costVES !== undefined && Number(p.costVES) > 0) ? Number(p.costVES) : (local?.costVES ?? (p.costUSD || 0)),
                      costExchangeUSD: p.costExchangeUSD || local?.costExchangeUSD || p.costUSD || local?.costUSD || 0
                    };
                  });
                try {
                  localStorage.setItem('siga_products', JSON.stringify(cleanProducts));
                } catch (e) {}
                return cleanProducts;
              });
            }
            if (Array.isArray(data.clients) && data.clients.length > 0) {
              const tombSet = new Set((tombstones.clients || []).map(String));
              const cleanClients = data.clients.filter((c: Client) => c && c.id && !tombSet.has(String(c.id)));
              setClients(cleanClients);
              try {
                localStorage.setItem('siga_clients', JSON.stringify(cleanClients));
              } catch (e) {}
            }
            if (Array.isArray(data.suppliers) && data.suppliers.length > 0) {
              const tombSet = new Set((tombstones.suppliers || []).map(String));
              const cleanSuppliers = data.suppliers.filter((s: Supplier) => s && s.id && !tombSet.has(String(s.id)));
              setSuppliers(cleanSuppliers);
              try {
                localStorage.setItem('siga_suppliers', JSON.stringify(cleanSuppliers));
              } catch (e) {}
            }
            if (Array.isArray(data.purchases) && data.purchases.length > 0) {
              const tombSet = new Set((tombstones.purchases || []).map(String));
              const cleanPurchases = data.purchases
                .filter((p: Purchase) => p && p.id && p.id !== 'COM-0001' && !(p.supplierName || '').toLowerCase().includes('polar') && !tombSet.has(String(p.id)))
                .sort((a: Purchase, b: Purchase) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
              setPurchases(cleanPurchases);
              try {
                localStorage.setItem('siga_purchases', JSON.stringify(cleanPurchases));
              } catch (e) {}
            }
            if (Array.isArray(data.users) && data.users.length > 0) {
              const tombSet = new Set((tombstones.users || []).map(String));
              const cleanUsers = data.users.filter((u: User) => u && u.id && !tombSet.has(String(u.id)));
              setUsers(cleanUsers);
              try {
                localStorage.setItem('siga_all_users_custom', JSON.stringify(cleanUsers));
                localStorage.setItem('siga_users', JSON.stringify(cleanUsers));
              } catch (e) {}
            }
            if (Array.isArray(data.transactions) && data.transactions.length > 0) {
              const tombSet = new Set((tombstones.transactions || []).map(String));
              const cleanTrx = data.transactions
                .filter((t: Transaction) => t && t.id && !tombSet.has(String(t.id)))
                .sort((a: Transaction, b: Transaction) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
              setTransactions(cleanTrx);
              try {
                localStorage.setItem('siga_transactions', JSON.stringify(cleanTrx));
              } catch (e) {}
            }
            if (data.exchangeRate && typeof data.exchangeRate.rate === 'number') {
              setExchangeRate(data.exchangeRate);
              localStorage.setItem('siga_rate', JSON.stringify(data.exchangeRate));
            }
            if (data.sequences) {
              setSequences(prev => {
                const merged = { ...prev, ...data.sequences };
                localStorage.setItem('siga_sequences', JSON.stringify(merged));
                return merged;
              });
            }
            if (Array.isArray(data.consignmentItems) && data.consignmentItems.length > 0) {
              setConsignmentItems(data.consignmentItems);
              localStorage.setItem('siga_consignment_stock', JSON.stringify(data.consignmentItems));
            }
            if (data.company) {
              setCompanySettings(data.company);
            }
            if (Array.isArray(data.activeSessions)) {
              setActiveSessions(data.activeSessions);
            }
            if (Array.isArray(data.liveActivities)) {
              setLiveActivities(data.liveActivities);
            }
          }
        }
      } catch (err) {
        console.warn("Server state fetch note:", err);
      }
    }

    loadServerState();

    // Connect Server-Sent Events for instant multi-user cross-communication
    try {
      eventSource = new EventSource('/api/events');
      eventSource.addEventListener('state_update', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          const tombstones = payload.tombstones || {};
          if (payload.products && Array.isArray(payload.products) && payload.products.length > 0) {
            setProducts(prev => {
              const tombSet = new Set((tombstones.products || []).map(String));
              const prevMap = new Map<string, Product>();
              prev.forEach(p => {
                if (p && p.id) prevMap.set(String(p.id), p);
              });
              const cleanProducts = payload.products
                .filter((p: Product) => p && p.id && !tombSet.has(String(p.id)))
                .map((p: Product) => {
                  const local = prevMap.get(String(p.id));
                  return {
                    ...local,
                    ...p,
                    imageUrl: p.imageUrl || local?.imageUrl,
                    priceUSD: (p.priceUSD !== undefined && Number(p.priceUSD) >= 0) ? Number(p.priceUSD) : (local?.priceUSD ?? 0),
                    priceVES: (p.priceVES !== undefined && Number(p.priceVES) > 0) ? Number(p.priceVES) : (local?.priceVES ?? (p.priceUSD || 0)),
                    priceWholesaleUSD: (p.priceWholesaleUSD !== undefined && Number(p.priceWholesaleUSD) >= 0) ? Number(p.priceWholesaleUSD) : (local?.priceWholesaleUSD ?? 0),
                    priceWholesaleVES: (p.priceWholesaleVES !== undefined && Number(p.priceWholesaleVES) > 0) ? Number(p.priceWholesaleVES) : (local?.priceWholesaleVES ?? (p.priceWholesaleUSD || 0)),
                    priceCuadrillasUSD: (p.priceCuadrillasUSD !== undefined && Number(p.priceCuadrillasUSD) >= 0) ? Number(p.priceCuadrillasUSD) : (local?.priceCuadrillasUSD ?? 0),
                    priceCuadrillasVES: (p.priceCuadrillasVES !== undefined && Number(p.priceCuadrillasVES) > 0) ? Number(p.priceCuadrillasVES) : (local?.priceCuadrillasVES ?? (p.priceCuadrillasUSD || 0)),
                    costUSD: (p.costUSD !== undefined && Number(p.costUSD) >= 0) ? Number(p.costUSD) : (local?.costUSD ?? 0),
                    costVES: (p.costVES !== undefined && Number(p.costVES) > 0) ? Number(p.costVES) : (local?.costVES ?? (p.costUSD || 0)),
                    costExchangeUSD: p.costExchangeUSD || local?.costExchangeUSD || p.costUSD || local?.costUSD || 0
                  };
                });
              try {
                localStorage.setItem('siga_products', JSON.stringify(cleanProducts));
              } catch (e) {}
              return cleanProducts;
            });
          }
          if (payload.clients && Array.isArray(payload.clients) && payload.clients.length > 0) {
            const tombSet = new Set((tombstones.clients || []).map(String));
            const cleanClients = payload.clients.filter((c: Client) => c && c.id && !tombSet.has(String(c.id)));
            setClients(cleanClients);
            try {
              localStorage.setItem('siga_clients', JSON.stringify(cleanClients));
            } catch (e) {}
          }
          if (payload.suppliers && Array.isArray(payload.suppliers) && payload.suppliers.length > 0) {
            const tombSet = new Set((tombstones.suppliers || []).map(String));
            const cleanSuppliers = payload.suppliers.filter((s: Supplier) => s && s.id && !tombSet.has(String(s.id)));
            setSuppliers(cleanSuppliers);
            try {
              localStorage.setItem('siga_suppliers', JSON.stringify(cleanSuppliers));
            } catch (e) {}
          }
          if (payload.purchases && Array.isArray(payload.purchases) && payload.purchases.length > 0) {
            const tombSet = new Set((tombstones.purchases || []).map(String));
            const cleanPurchases = payload.purchases
              .filter((p: Purchase) => p && p.id && p.id !== 'COM-0001' && !(p.supplierName || '').toLowerCase().includes('polar') && !tombSet.has(String(p.id)))
              .sort((a: Purchase, b: Purchase) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setPurchases(cleanPurchases);
            try {
              localStorage.setItem('siga_purchases', JSON.stringify(cleanPurchases));
            } catch (e) {}
          }
          if (payload.users && Array.isArray(payload.users)) {
            const tombSet = new Set((tombstones.users || []).map(String));
            const cleanUsers = payload.users.filter((u: User) => u && u.id && !tombSet.has(String(u.id)));
            setUsers(cleanUsers);
            try {
              localStorage.setItem('siga_all_users_custom', JSON.stringify(cleanUsers));
              localStorage.setItem('siga_users', JSON.stringify(cleanUsers));
            } catch (e) {}
          }
          if (payload.transactions && Array.isArray(payload.transactions) && payload.transactions.length > 0) {
            const tombSet = new Set((tombstones.transactions || []).map(String));
            const cleanTrx = payload.transactions
              .filter((t: Transaction) => t && t.id && !tombSet.has(String(t.id)))
              .sort((a: Transaction, b: Transaction) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setTransactions(cleanTrx);
            try {
              localStorage.setItem('siga_transactions', JSON.stringify(cleanTrx));
            } catch (e) {}
          }
          if (payload.exchangeRate) {
            setExchangeRate(payload.exchangeRate);
            localStorage.setItem('siga_rate', JSON.stringify(payload.exchangeRate));
          }
          if (payload.sequences) {
            setSequences(payload.sequences);
            localStorage.setItem('siga_sequences', JSON.stringify(payload.sequences));
          }
          if (payload.consignmentItems && Array.isArray(payload.consignmentItems)) {
            setConsignmentItems(payload.consignmentItems);
            localStorage.setItem('siga_consignment_stock', JSON.stringify(payload.consignmentItems));
          }
          if (payload.company) {
            setCompanySettings(payload.company);
          }
        } catch (err) {}
      });

      eventSource.addEventListener('sessions_update', (e: MessageEvent) => {
        try {
          const sessions = JSON.parse(e.data);
          if (Array.isArray(sessions)) {
            setActiveSessions(sessions);
          }
        } catch (err) {}
      });

      eventSource.addEventListener('item_deleted', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          const { collection: col, deletedIds } = payload;
          if (!Array.isArray(deletedIds) || deletedIds.length === 0) return;
          const idSet = new Set(deletedIds.map(String));

          if (col === 'products') {
            setProducts(prev => {
              const next = prev.filter(p => !idSet.has(String(p.id)));
              try { localStorage.setItem('siga_products', JSON.stringify(next)); } catch (e) {}
              return next;
            });
          } else if (col === 'clients') {
            setClients(prev => {
              const next = prev.filter(c => !idSet.has(String(c.id)));
              try { localStorage.setItem('siga_clients', JSON.stringify(next)); } catch (e) {}
              return next;
            });
          } else if (col === 'suppliers') {
            setSuppliers(prev => {
              const next = prev.filter(s => !idSet.has(String(s.id)));
              try { localStorage.setItem('siga_suppliers', JSON.stringify(next)); } catch (e) {}
              return next;
            });
          } else if (col === 'transactions') {
            setTransactions(prev => {
              const next = prev.filter(t => !idSet.has(String(t.id)));
              try { localStorage.setItem('siga_transactions', JSON.stringify(next)); } catch (e) {}
              return next;
            });
          } else if (col === 'purchases') {
            setPurchases(prev => {
              const next = prev.filter(p => !idSet.has(String(p.id)));
              try { localStorage.setItem('siga_purchases', JSON.stringify(next)); } catch (e) {}
              return next;
            });
          } else if (col === 'users') {
            setUsers(prev => {
              const next = prev.filter(u => !idSet.has(String(u.id)));
              try {
                localStorage.setItem('siga_all_users_custom', JSON.stringify(next));
                localStorage.setItem('siga_users', JSON.stringify(next));
              } catch (e) {}
              return next;
            });
          }
        } catch (err) {
          console.warn("Error processing item_deleted SSE event:", err);
        }
      });

      eventSource.addEventListener('history_reset', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          setTransactions([]);
          setPurchases([]);
          if (payload.sequences) {
            setSequences(payload.sequences);
            try { localStorage.setItem('siga_sequences', JSON.stringify(payload.sequences)); } catch (e) {}
          }
          try {
            localStorage.setItem('siga_transactions', JSON.stringify([]));
            localStorage.setItem('siga_purchases', JSON.stringify([]));
          } catch (e) {}
        } catch (err) {
          console.warn("Error processing history_reset SSE event:", err);
        }
      });

      eventSource.addEventListener('new_activity', (e: MessageEvent) => {
        try {
          const act = JSON.parse(e.data);
          setLiveActivities(prev => [act, ...prev.filter(a => a.id !== act.id)].slice(0, 50));
        } catch (err) {}
      });
    } catch (e) {
      console.warn("SSE connection note:", e);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  // Real-time synchronization listeners for each collection in Firestore
  useEffect(() => {
    if (!isOnline) return;

    console.log("Initializing real-time Firestore synchronization listeners...");

    const handleSnapError = (coll: string) => (err: any) => {
      checkQuotaError(err);
      console.warn(`Firestore snapshot listener warning (${coll}):`, err.message || err);
    };

    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const removedIds = new Set<string>();
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          removedIds.add(change.doc.id);
          removedIds.add(fromSafeDocId(change.doc.id));
        }
      });
      if (removedIds.size > 0) {
        setProducts(prev => {
          const next = prev.filter(p => !removedIds.has(String(p.id)) && !removedIds.has(toSafeDocId(p.id)));
          try { localStorage.setItem('siga_products', JSON.stringify(next)); } catch (e) {}
          return next;
        });
      }

      const list: Product[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Product;
        if (!data.id) {
          data.id = fromSafeDocId(docSnap.id);
        }
        list.push(data);
      });
      if (list.length > 0) {
        setProducts(prev => {
          const map = new Map<string, Product>();
          prev.forEach(p => {
            if (!removedIds.has(String(p.id)) && !removedIds.has(toSafeDocId(p.id))) {
              map.set(p.id, p);
            }
          });
          list.forEach(p => {
            const existing = map.get(p.id);
            const img = p.imageUrl || existing?.imageUrl || "/uploads/placeholder.jpg";
            const preserved: Product = {
              ...existing,
              ...p,
              imageUrl: img,
              priceUSD: (p.priceUSD !== undefined && Number(p.priceUSD) >= 0) ? Number(p.priceUSD) : (existing?.priceUSD ?? 0),
              priceVES: (p.priceVES !== undefined && Number(p.priceVES) > 0) ? Number(p.priceVES) : (existing?.priceVES ?? (p.priceUSD || 0)),
              priceWholesaleUSD: (p.priceWholesaleUSD !== undefined && Number(p.priceWholesaleUSD) >= 0) ? Number(p.priceWholesaleUSD) : (existing?.priceWholesaleUSD ?? 0),
              priceWholesaleVES: (p.priceWholesaleVES !== undefined && Number(p.priceWholesaleVES) > 0) ? Number(p.priceWholesaleVES) : (existing?.priceWholesaleVES ?? (p.priceWholesaleUSD || 0)),
              priceCuadrillasUSD: (p.priceCuadrillasUSD !== undefined && Number(p.priceCuadrillasUSD) >= 0) ? Number(p.priceCuadrillasUSD) : (existing?.priceCuadrillasUSD ?? 0),
              priceCuadrillasVES: (p.priceCuadrillasVES !== undefined && Number(p.priceCuadrillasVES) > 0) ? Number(p.priceCuadrillasVES) : (existing?.priceCuadrillasVES ?? (p.priceCuadrillasUSD || 0)),
              costUSD: (p.costUSD !== undefined && Number(p.costUSD) >= 0) ? Number(p.costUSD) : (existing?.costUSD ?? 0),
              costVES: (p.costVES !== undefined && Number(p.costVES) > 0) ? Number(p.costVES) : (existing?.costVES ?? (p.costUSD || 0)),
              costExchangeUSD: p.costExchangeUSD || existing?.costExchangeUSD || p.costUSD || existing?.costUSD || 0
            };
            map.set(p.id, preserved);
          });
          const merged = Array.from(map.values());
          if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
          try {
            localStorage.setItem('siga_products', JSON.stringify(merged));
          } catch (e) {}
          return merged;
        });
      }
    }, handleSnapError('products'));

    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const removedIds = new Set<string>();
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          removedIds.add(change.doc.id);
          removedIds.add(fromSafeDocId(change.doc.id));
        }
      });
      if (removedIds.size > 0) {
        setClients(prev => {
          const next = prev.filter(c => !removedIds.has(String(c.id)) && !removedIds.has(toSafeDocId(c.id)));
          try { localStorage.setItem('siga_clients', JSON.stringify(next)); } catch (e) {}
          return next;
        });
      }

      const list: Client[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Client;
        if (!data.id) {
          data.id = fromSafeDocId(docSnap.id);
        }
        list.push(data);
      });
      if (list.length > 0) {
        setClients(prev => {
          const map = new Map<string, Client>();
          prev.forEach(c => {
            if (!removedIds.has(String(c.id)) && !removedIds.has(toSafeDocId(c.id))) {
              map.set(c.id, c);
            }
          });
          list.forEach(c => map.set(c.id, c));
          const merged = Array.from(map.values());
          try {
            localStorage.setItem('siga_clients', JSON.stringify(merged));
          } catch (e) {}
          return merged;
        });
      }
    }, handleSnapError('clients'));

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const removedIds = new Set<string>();
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          removedIds.add(change.doc.id);
          removedIds.add(fromSafeDocId(change.doc.id));
        }
      });
      if (removedIds.size > 0) {
        setSuppliers(prev => {
          const next = prev.filter(s => !removedIds.has(String(s.id)) && !removedIds.has(toSafeDocId(s.id)));
          try { localStorage.setItem('siga_suppliers', JSON.stringify(next)); } catch (e) {}
          return next;
        });
      }

      const list: Supplier[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Supplier;
        if (!data.id) {
          data.id = fromSafeDocId(docSnap.id);
        }
        list.push(data);
      });
      if (list.length > 0) {
        setSuppliers(prev => {
          const map = new Map<string, Supplier>();
          prev.forEach(s => {
            if (!removedIds.has(String(s.id)) && !removedIds.has(toSafeDocId(s.id))) {
              map.set(s.id, s);
            }
          });
          list.forEach(s => map.set(s.id, s));
          const merged = Array.from(map.values());
          try {
            localStorage.setItem('siga_suppliers', JSON.stringify(merged));
          } catch (e) {}
          return merged;
        });
      }
    }, handleSnapError('suppliers'));

    const unsubTransactions = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      const removedIds = new Set<string>();
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          removedIds.add(change.doc.id);
          removedIds.add(fromSafeDocId(change.doc.id));
        }
      });
      if (removedIds.size > 0) {
        setTransactions(prev => {
          const next = prev.filter(t => !removedIds.has(String(t.id)) && !removedIds.has(toSafeDocId(t.id)));
          try { localStorage.setItem('siga_transactions', JSON.stringify(next)); } catch (e) {}
          return next;
        });
      }

      const remoteList: Transaction[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Transaction;
        if (!data.id) {
          data.id = fromSafeDocId(docSnap.id);
        }
        remoteList.push(data);
      });
      if (remoteList.length > 0) {
        setTransactions(prev => {
          const map = new Map<string, Transaction>();
          prev.forEach(t => {
            if (!removedIds.has(String(t.id)) && !removedIds.has(toSafeDocId(t.id))) {
              map.set(t.id, t);
            }
          });
          remoteList.forEach(t => map.set(t.id, t));
          const merged = Array.from(map.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          try {
            localStorage.setItem('siga_transactions', JSON.stringify(merged));
          } catch (e) {}
          return merged;
        });
      }
    }, handleSnapError('transactions'));

    const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snapshot) => {
      const removedIds = new Set<string>();
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          removedIds.add(change.doc.id);
          removedIds.add(fromSafeDocId(change.doc.id));
        }
      });
      if (removedIds.size > 0) {
        setPurchases(prev => {
          const next = prev.filter(p => !removedIds.has(String(p.id)) && !removedIds.has(toSafeDocId(p.id)));
          try { localStorage.setItem('siga_purchases', JSON.stringify(next)); } catch (e) {}
          return next;
        });
      }

      const remoteList: Purchase[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Purchase;
        if (!data.id) {
          data.id = fromSafeDocId(docSnap.id);
        }
        remoteList.push(data);
      });
      if (remoteList.length > 0) {
        setPurchases(prev => {
          const map = new Map<string, Purchase>();
          prev.forEach(p => {
            if (!removedIds.has(String(p.id)) && !removedIds.has(toSafeDocId(p.id))) {
              map.set(p.id, p);
            }
          });
          remoteList
            .filter((p: Purchase) => p && p.id !== 'COM-0001' && !(p.supplierName || '').toLowerCase().includes('polar'))
            .forEach(p => map.set(p.id, p));
          const merged = Array.from(map.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          try {
            localStorage.setItem('siga_purchases', JSON.stringify(merged));
          } catch (e) {}
          return merged;
        });
      }
    }, handleSnapError('purchases'));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const removedIds = new Set<string>();
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          removedIds.add(change.doc.id);
          removedIds.add(fromSafeDocId(change.doc.id));
        }
      });
      if (removedIds.size > 0) {
        setUsers(prev => {
          const next = prev.filter(u => !removedIds.has(String(u.id)) && !removedIds.has(toSafeDocId(u.id)));
          try {
            localStorage.setItem('siga_all_users_custom', JSON.stringify(next));
            localStorage.setItem('siga_users', JSON.stringify(next));
          } catch (e) {}
          return next;
        });
      }

      const list: User[] = [];
      snapshot.forEach(docSnap => {
        list.push(docSnap.data() as User);
      });
      if (list.length > 0) {
        setUsers(prev => {
          const map = new Map<string, User>();
          prev.forEach(u => {
            if (!removedIds.has(String(u.id)) && !removedIds.has(toSafeDocId(u.id))) {
              map.set(u.id, u);
            }
          });
          list.forEach(u => map.set(u.id, u));
          const merged = Array.from(map.values());
          if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
          try {
            localStorage.setItem('siga_all_users_custom', JSON.stringify(merged));
            localStorage.setItem('siga_users', JSON.stringify(merged));
          } catch (e) {}
          return merged;
        });
      }
    }, handleSnapError('users'));

    const unsubSettings = onSnapshot(collection(db, 'settings'), (snapshot) => {
      snapshot.forEach(docSnap => {
        const id = docSnap.id;
        const data = docSnap.data();
        if (id === 'company') {
          setCompanySettings(prev => {
            if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
            return data as CompanySettings;
          });
        } else if (id === 'exchangeRate') {
          setExchangeRate(prev => {
            if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
            return data as ExchangeRate;
          });
        } else if (id === 'sequences') {
          setSequences(prev => {
            if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
            return data as Record<string, number>;
          });
        }
      });
    }, handleSnapError('settings'));

    // Real-time Active Sessions list
    const unsubSessions = onSnapshot(collection(db, 'active_sessions'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      const now = Date.now();
      const active = list.filter(s => (now - s.lastSeen) < 5 * 60 * 1000);
      setActiveSessions(active);
    }, handleSnapError('active_sessions'));

    // Real-time Activity feed list
    const unsubActivities = onSnapshot(collection(db, 'live_activities'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => b.timestamp - a.timestamp);
      setLiveActivities(list.slice(0, 50));
    }, handleSnapError('live_activities'));

    return () => {
      unsubProducts();
      unsubClients();
      unsubSuppliers();
      unsubTransactions();
      unsubPurchases();
      unsubUsers();
      unsubSettings();
      unsubSessions();
      unsubActivities();
    };
  }, [isOnline]);

  // Synchronized state wrappers
  const updateProducts = (value: React.SetStateAction<Product[]>) => {
    setProducts(prev => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;

      // Deletion guard: only Administrador can remove products
      let removedIds: string[] = [];
      if (prev.length > next.length) {
        if (currentUser.role !== 'Administrador') {
          alert('⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para eliminar productos.');
          return prev;
        }
        const removed = prev.filter(p => !next.some(n => String(n.id) === String(p.id)));
        removedIds = removed.map(r => String(r.id));
        if (removedIds.length > 0) {
          removedIds.forEach(id => deleteSingleDoc('products', id).catch(console.warn));
          fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collection: 'products', ids: removedIds, user: currentUser })
          }).catch(console.warn);
        }
      }

      try {
        localStorage.setItem('siga_products', JSON.stringify(next));
      } catch (e) {
        console.warn("Storage quota warning on updateProducts:", e);
      }

      // Push to central server for instant cross-user SSE sync
      if (removedIds.length > 0) {
        notifyServerSync({ products: next, deletedCollection: 'products', deletedIds: removedIds });
      } else {
        notifyServerSync({ products: next });
      }

      if (isOnline) {
        if (Math.abs(next.length - prev.length) > 15) {
          // Bulk migration or large import: use chunked batch operations for speed and reliability
          batchSaveProducts(next).catch(err => console.error("Batch save error:", err));
        } else {
          // Incremental individual saves - only update products that actually changed
          next.forEach((p: Product) => {
            const old = prev.find(o => o.id === p.id);
            if (!old || JSON.stringify(old) !== JSON.stringify(p)) {
              syncSingleDoc('products', p.id, p);
            }
          });
        }
      }
      return next;
    });
  };

  const updateClients = (value: React.SetStateAction<Client[]>) => {
    setClients(prev => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;

      // Deletion guard: only Administrador can remove clients
      let removedIds: string[] = [];
      if (prev.length > next.length) {
        if (currentUser.role !== 'Administrador') {
          alert('⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para eliminar clientes.');
          return prev;
        }
        const removed = prev.filter(c => !next.some(n => String(n.id) === String(c.id)));
        removedIds = removed.map(r => String(r.id));
        if (removedIds.length > 0) {
          removedIds.forEach(id => deleteSingleDoc('clients', id).catch(console.warn));
          fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collection: 'clients', ids: removedIds, user: currentUser })
          }).catch(console.warn);
        }
      }

      try {
        localStorage.setItem('siga_clients', JSON.stringify(next));
      } catch (e) {}

      // Push to central server for instant cross-user SSE sync
      if (removedIds.length > 0) {
        notifyServerSync({ clients: next, deletedCollection: 'clients', deletedIds: removedIds });
      } else {
        notifyServerSync({ clients: next });
      }

      next.forEach((c: Client) => {
        const old = prev.find(o => o.id === c.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(c)) {
          syncSingleDoc('clients', c.id, c);
        }
      });
      return next;
    });
  };

  const updateSuppliers = (value: React.SetStateAction<Supplier[]>) => {
    setSuppliers(prev => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;

      // Deletion guard: only Administrador can remove suppliers
      let removedIds: string[] = [];
      if (prev.length > next.length) {
        if (currentUser.role !== 'Administrador') {
          alert('⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para eliminar proveedores.');
          return prev;
        }
        const removed = prev.filter(s => !next.some(n => String(n.id) === String(s.id)));
        removedIds = removed.map(r => String(r.id));
        if (removedIds.length > 0) {
          removedIds.forEach(id => deleteSingleDoc('suppliers', id).catch(console.warn));
          fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collection: 'suppliers', ids: removedIds, user: currentUser })
          }).catch(console.warn);
        }
      }

      try {
        localStorage.setItem('siga_suppliers', JSON.stringify(next));
      } catch (e) {}

      // Push to central server for instant cross-user SSE sync
      if (removedIds.length > 0) {
        notifyServerSync({ suppliers: next, deletedCollection: 'suppliers', deletedIds: removedIds });
      } else {
        notifyServerSync({ suppliers: next });
      }

      next.forEach((s: Supplier) => {
        const old = prev.find(o => o.id === s.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(s)) {
          syncSingleDoc('suppliers', s.id, s);
        }
      });
      return next;
    });
  };

  const updateTransactions = (value: React.SetStateAction<Transaction[]>) => {
    setTransactions(prev => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;

      // Deletion guard: only Administrador can remove transactions
      let removedIds: string[] = [];
      if (prev.length > next.length) {
        if (currentUser.role !== 'Administrador') {
          alert('⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para eliminar transacciones.');
          return prev;
        }
        const removed = prev.filter(t => !next.some(n => String(n.id) === String(t.id)));
        removedIds = removed.map(r => String(r.id));
        if (removedIds.length > 0) {
          removedIds.forEach(id => deleteSingleDoc('transactions', id).catch(console.warn));
          fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collection: 'transactions', ids: removedIds, user: currentUser })
          }).catch(console.warn);
        }
      }

      localStorage.setItem('siga_transactions', JSON.stringify(next));

      // Push to central server for instant cross-user SSE sync
      if (removedIds.length > 0) {
        notifyServerSync({
          transactions: next,
          deletedCollection: 'transactions',
          deletedIds: removedIds,
          activity: {
            username: currentUser.username,
            action: 'Eliminación Transacción',
            details: `Documento eliminado permanentemente por el Administrador`
          }
        });
      } else {
        notifyServerSync({
          transactions: next,
          activity: {
            username: currentUser.username,
            action: 'Transacción Comercial',
            details: `Registro de documento actualizado en tiempo real`
          }
        });
      }
      
      // Handle inventory stock refunds instantly when a document transitions to "anulado"
      next.forEach((newTrx: Transaction) => {
        const oldTrx = prev.find(o => o.id === newTrx.id);
        if (oldTrx && oldTrx.status !== 'anulado' && newTrx.status === 'anulado') {
          console.log(`Transaction ${newTrx.id} annulled. Refunding inventory...`);
          
          const isFromConsignment = newTrx.inventorySource === 'consignacion' || newTrx.additionalNotes?.includes('Origen: Consignación') || newTrx.paymentMethod === 'Consignación Abierta';

          if (isFromConsignment) {
            setConsignmentItems(cPrev => {
              const updated = [...cPrev];
              newTrx.items.forEach(item => {
                const key = `${newTrx.clientRif}_${item.productId}`;
                const existingIndex = updated.findIndex(idx => idx.id === key || (idx.clientRif === newTrx.clientRif && idx.productId === item.productId));
                if (existingIndex >= 0) {
                  updated[existingIndex] = {
                    ...updated[existingIndex],
                    qty: updated[existingIndex].qty + item.qty,
                    updatedAt: new Date().toISOString()
                  };
                } else {
                  updated.push({
                    id: key,
                    clientRif: newTrx.clientRif,
                    clientName: newTrx.clientName,
                    productId: item.productId,
                    productName: item.name,
                    qty: item.qty,
                    updatedAt: new Date().toISOString()
                  });
                }
              });
              return updated;
            });
          } else {
            setProducts(pPrev => {
              const updatedProducts = pPrev.map(prod => {
                const itemInTrx = newTrx.items.find(it => it.productId === prod.id);
                if (itemInTrx) {
                  const updatedProd = {
                    ...prod,
                    stock: prod.stock + itemInTrx.qty,
                    updatedAt: new Date().toISOString()
                  };
                  if (isOnline) {
                    syncSingleDoc('products', prod.id, updatedProd);
                  }
                  return updatedProd;
                }
                return prod;
              });
              return updatedProducts;
            });

            if (newTrx.type === 'consignacion') {
              setConsignmentItems(cPrev => {
                const updated = [...cPrev];
                newTrx.items.forEach(item => {
                  const key = `${newTrx.clientRif}_${item.productId}`;
                  const existingIndex = updated.findIndex(idx => idx.id === key || (idx.clientRif === newTrx.clientRif && idx.productId === item.productId));
                  if (existingIndex >= 0) {
                    updated[existingIndex] = {
                      ...updated[existingIndex],
                      qty: Math.max(0, updated[existingIndex].qty - item.qty),
                      updatedAt: new Date().toISOString()
                    };
                  }
                });
                return updated.filter(u => u.qty > 0);
              });
            }
          }

          // Register a local activity log for this annulment
          const detailsDesc = `${currentUser.username} ANULÓ el documento ${newTrx.id} por valor de ${newTrx.totalUSD.toFixed(2)}$ para "${newTrx.clientName}"`;
          handleAddSyncLog('Anulación', detailsDesc);
        }
      });

      next.forEach((t: Transaction) => {
        const old = prev.find(o => o.id === t.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(t)) {
          syncSingleDoc('transactions', t.id, t);
        }
      });
      return next;
    });
  };

  const updatePurchases = (value: React.SetStateAction<Purchase[]>) => {
    setPurchases(prev => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;

      // Deletion guard: only Administrador can remove purchases
      let removedIds: string[] = [];
      if (prev.length > next.length) {
        if (currentUser.role !== 'Administrador') {
          alert('⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para eliminar registros de compras.');
          return prev;
        }
        const removed = prev.filter(p => !next.some(n => String(n.id) === String(p.id)));
        removedIds = removed.map(r => String(r.id));
        if (removedIds.length > 0) {
          removedIds.forEach(id => deleteSingleDoc('purchases', id).catch(console.warn));
          fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collection: 'purchases', ids: removedIds, user: currentUser })
          }).catch(console.warn);
        }
      }

      try {
        localStorage.setItem('siga_purchases', JSON.stringify(next));
      } catch (e) {}

      // Push to central server for instant cross-user SSE sync
      if (removedIds.length > 0) {
        notifyServerSync({
          purchases: next,
          deletedCollection: 'purchases',
          deletedIds: removedIds,
          activity: {
            username: currentUser.username,
            action: 'Eliminación Compra',
            details: `Orden de compra eliminada permanentemente por el Administrador`
          }
        });
      } else {
        notifyServerSync({
          purchases: next,
          activity: {
            username: currentUser.username,
            action: 'Compra / Surtido',
            details: `Actualización de compras y almacén central`
          }
        });
      }

      next.forEach((p: Purchase) => {
        const old = prev.find(o => o.id === p.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(p)) {
          syncSingleDoc('purchases', p.id, p);
        }
      });
      return next;
    });
  };

  const updateUsers = (value: React.SetStateAction<User[]>) => {
    setUsers(prev => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;

      // Deletion guard: only Administrador can remove users
      let removedIds: string[] = [];
      if (prev.length > next.length) {
        if (currentUser.role !== 'Administrador') {
          alert('⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para eliminar usuarios.');
          return prev;
        }
        const removed = prev.filter(u => !next.some(n => String(n.id) === String(u.id)));
        removedIds = removed.map(r => String(r.id));
        if (removedIds.length > 0) {
          removedIds.forEach(id => deleteSingleDoc('users', id).catch(console.warn));
          fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collection: 'users', ids: removedIds, user: currentUser })
          }).catch(console.warn);
        }
      }

      try {
        localStorage.setItem('siga_all_users_custom', JSON.stringify(next));
        localStorage.setItem('siga_users', JSON.stringify(next));
      } catch (e) {}

      // Push to central server for instant cross-user SSE sync
      if (removedIds.length > 0) {
        notifyServerSync({ users: next, deletedCollection: 'users', deletedIds: removedIds });
      } else {
        notifyServerSync({ users: next });
      }

      next.forEach((u: User) => {
        const old = prev.find(o => o.id === u.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(u)) {
          syncSingleDoc('users', u.id, u);
        }
      });
      return next;
    });
  };

  const updateCompanySettings = (value: React.SetStateAction<CompanySettings>) => {
    setCompanySettings(prev => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;
      try {
        localStorage.setItem('siga_company', JSON.stringify(next));
      } catch (e) {}
      notifyServerSync({ company: next });
      syncSingleDoc('settings', 'company', next);
      return next;
    });
  };

  const updateExchangeRate = (value: React.SetStateAction<ExchangeRate>) => {
    setExchangeRate(prev => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;
      try {
        localStorage.setItem('siga_rate', JSON.stringify(next));
      } catch (e) {}
      notifyServerSync({ exchangeRate: next });
      syncSingleDoc('settings', 'exchangeRate', next);
      return next;
    });
  };

  const calculateConsignmentItems = (trxs: Transaction[]): ConsignmentItem[] => {
    const stockMap: Record<string, ConsignmentItem> = {};
    const sortedTrxs = [...(trxs || [])].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    sortedTrxs.forEach(trx => {
      if (trx.status === 'anulado') return;
      const clientRif = trx.clientRif || 'V-';
      const clientName = trx.clientName || 'Cliente';

      if (trx.type === 'consignacion') {
        (trx.items || []).forEach(it => {
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
          (trx.items || []).forEach(it => {
            const key = `${clientRif}_${it.productId}`;
            if (stockMap[key]) {
              stockMap[key].qty = Math.max(0, stockMap[key].qty - (it.qty || 0));
              stockMap[key].updatedAt = trx.timestamp;
            }
          });
        }
      }
    });

    return Object.values(stockMap).filter(item => item.qty > 0);
  };

  // Consignment inventory state per client (for Point 1 & 2)
  const [consignmentItems, setConsignmentItems] = useState<ConsignmentItem[]>(() => {
    const cached = localStorage.getItem('siga_consignment_stock');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        // Fallback
      }
    }
    return calculateConsignmentItems(dbState.transactions || []);
  });

  const updateConsignmentItems = (value: React.SetStateAction<ConsignmentItem[]>) => {
    setConsignmentItems(prev => {
      const next = typeof value === 'function' ? (value as any)(prev) : value;
      localStorage.setItem('siga_consignment_stock', JSON.stringify(next));
      notifyServerSync({ consignmentItems: next });
      return next;
    });
  };

  // Re-synchronize consignment stock whenever transactions change
  useEffect(() => {
    if (transactions && transactions.length > 0) {
      const computed = calculateConsignmentItems(transactions);
      if (computed.length > 0) {
        setConsignmentItems(computed);
        localStorage.setItem('siga_consignment_stock', JSON.stringify(computed));
      }
    }
  }, [transactions]);

  // Watch exchangeRate and save to local storage
  useEffect(() => {
    localStorage.setItem('siga_rate', JSON.stringify(exchangeRate));
  }, [exchangeRate]);

  // Shell tabs navigations
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Real-time user presence heartbeat to central server
  useEffect(() => {
    if (!currentUser) return;
    const sendPresence = () => {
      fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: currentUser,
          tab: activeTab
        })
      }).catch(() => {});
    };
    sendPresence();
    const interval = setInterval(sendPresence, 15000);
    return () => clearInterval(interval);
  }, [currentUser, activeTab]);

  // Login authentication state
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('siga_is_logged_in') === 'true';
  });

  // Global theme switcher (Saves preference in cache)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('siga_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('siga_theme', theme);
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      document.body.classList.add('light');
    } else {
      root.classList.remove('light');
      document.body.classList.remove('light');
    }
  }, [theme]);

  // Scanner modal global state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [onScanSuccessCallback, setOnScanSuccessCallback] = useState<(barcode: string) => void>(() => () => {});

  // Update central state when individual states change
  useEffect(() => {
    const updatedState = {
      products,
      clients,
      suppliers,
      company: companySettings,
      exchangeRate,
      users,
      currentUser,
      transactions,
      purchases,
      syncLogs,
      isOnline
    };
    saveDB(updatedState);
  }, [products, clients, suppliers, companySettings, exchangeRate, currentUser, transactions, purchases, syncLogs, isOnline, users]);

  // Handle open scanner globally
  const handleOpenScanner = (onScanSuccess: (barcode: string) => void) => {
    setOnScanSuccessCallback(() => onScanSuccess);
    setIsScannerOpen(true);
  };

  // Auth handle logins
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    localStorage.setItem('siga_is_logged_in', 'true');
    localStorage.setItem('siga_current_user', JSON.stringify(user));
  };

  // Auth handle logouts
  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('siga_is_logged_in');
    setActiveTab('dashboard'); // Reset active tab
  };

  // Profile data and profile picture updates
  const handleUpdateProfile = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    
    // Also update users state
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    
    // Persist to custom users cache so presets select it properly
    const savedUsersCached = localStorage.getItem('siga_all_users_custom');
    let customUsersList: User[] = [];
    if (savedUsersCached) {
      customUsersList = JSON.parse(savedUsersCached);
    }
    const idx = customUsersList.findIndex(cu => cu.id === updatedUser.id);
    if (idx >= 0) {
      customUsersList[idx] = updatedUser;
    } else {
      customUsersList.push(updatedUser);
    }
    localStorage.setItem('siga_all_users_custom', JSON.stringify(customUsersList));
  };

  const handleUpdateCompany = (updatedCompany: CompanySettings) => {
    setCompanySettings(updatedCompany);
  };

  // Callback additions for sales/invoices
  const handleAddTransaction = (newTrx: Transaction) => {
    const isOfflineMode = !isOnline;
    const isFromConsignment = newTrx.inventorySource === 'consignacion';

    if (isFromConsignment) {
      // Deduct from client's consignment balance, do NOT deduct from general warehouse products stock.
      setConsignmentItems(prev => {
        const updated = [...prev];
        newTrx.items.forEach(item => {
          const key = `${newTrx.clientRif}_${item.productId}`;
          const existingIndex = updated.findIndex(idx => idx.id === key || (idx.clientRif === newTrx.clientRif && idx.productId === item.productId));
          if (existingIndex >= 0) {
            updated[existingIndex] = {
              ...updated[existingIndex],
              qty: Math.max(0, updated[existingIndex].qty - item.qty),
              updatedAt: new Date().toISOString()
            };
          }
        });
        const filtered = updated.filter(u => u.qty > 0);
        localStorage.setItem('siga_consignment_stock', JSON.stringify(filtered));
        notifyServerSync({ consignmentItems: filtered });
        return filtered;
      });
    } else {
      // Deduct from standard general products warehouse stock
      const updatedProducts = products.map(prod => {
        const itemInTrx = newTrx.items.find(it => it.productId === prod.id);
        if (itemInTrx) {
          return {
            ...prod,
            stock: Math.max(0, prod.stock - itemInTrx.qty),
            updatedAt: new Date().toISOString()
          };
        }
        return prod;
      });
      updateProducts(updatedProducts);
    }

    // If transaction is a brand-new consignment, add its items to consignmentItems
    if (newTrx.type === 'consignacion') {
      setConsignmentItems(prev => {
        const updated = [...prev];
        newTrx.items.forEach(item => {
          const key = `${newTrx.clientRif}_${item.productId}`;
          const existingIndex = updated.findIndex(idx => idx.id === key || (idx.clientRif === newTrx.clientRif && idx.productId === item.productId));
          if (existingIndex >= 0) {
            updated[existingIndex] = {
              ...updated[existingIndex],
              qty: updated[existingIndex].qty + item.qty,
              updatedAt: new Date().toISOString(),
              createdByName: newTrx.createdByName,
              documentId: newTrx.id
            };
          } else {
            updated.push({
              id: key,
              clientRif: newTrx.clientRif,
              clientName: newTrx.clientName,
              productId: item.productId,
              productName: item.name,
              qty: item.qty,
              updatedAt: new Date().toISOString(),
              createdByName: newTrx.createdByName,
              documentId: newTrx.id
            });
          }
        });
        localStorage.setItem('siga_consignment_stock', JSON.stringify(updated));
        notifyServerSync({ consignmentItems: updated });
        return updated;
      });
    }

    // Save transaction via real-time sync wrapper
    updateTransactions(prev => [newTrx, ...prev]);

    // Update shared sequences across the system
    const match = newTrx.id.match(/-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) {
        setSequences(prev => {
          const next = { ...prev, [newTrx.type]: Math.max(prev[newTrx.type] || 0, num) };
          if (isOnline) {
            syncSingleDoc('settings', 'sequences', next);
          }
          return next;
        });
      }
    }

    // Create sync log
    const log: SyncLog = {
      id: 'log-' + Date.now(),
      timestamp: new Date().toISOString(),
      action: newTrx.type === 'factura' ? 'Factura Emitida' : newTrx.type === 'cotizacion' ? 'Cotización Registrada' : newTrx.type === 'recibo' ? 'Recibo Generado' : 'Consignación Registrada',
      details: `${newTrx.type.toUpperCase()} ${newTrx.id} por valor de ${newTrx.totalUSD.toFixed(2)}$ para "${newTrx.clientName}".${isFromConsignment ? ' [Origen: Consignación]' : ''}`,
      synced: !isOfflineMode,
      user: currentUser.username
    };
    setSyncLogs([log, ...syncLogs]);
  };

  // Callback for replenishment purchases
  const handleAddPurchase = (newPurchase: Purchase) => {
    updatePurchases(prev => [newPurchase, ...prev]);

    // Add stock to products and sync using functional updater to avoid stale state
    updateProducts(prev => {
      const updated = prev.map(prod => {
        const itemInPurchase = newPurchase.items.find(it => {
          const itemCode = String(it.productId || '').trim().toLowerCase();
          const itemSku = String((it as any).sku || '').trim().toLowerCase();
          const prodId = String(prod.id || '').trim().toLowerCase();
          const prodSku = String(prod.sku || '').trim().toLowerCase();
          return itemCode === prodId || (prodSku && itemCode === prodSku) || (itemSku && itemSku === prodSku) || (itemSku && itemSku === prodId);
        });
        if (itemInPurchase) {
          const addedQty = Number(itemInPurchase.qty) || 0;
          const newCostUSD = Number(itemInPurchase.costUSD) > 0 ? Number(itemInPurchase.costUSD) : prod.costUSD;
          const rateUsed = newPurchase.exchangeRateUsed || exchangeRate.rate || 1;
          const newCostVES = (itemInPurchase as any).costVES > 0 
            ? (itemInPurchase as any).costVES 
            : newCostUSD;
          
          let newPriceUSD = prod.priceUSD;
          let newPriceVES = prod.priceVES;
          if (itemInPurchase.priceUpdate && itemInPurchase.priceUpdate > 0) {
            newPriceUSD = itemInPurchase.priceUpdate;
            newPriceVES = (itemInPurchase as any).priceUpdateVES || newPriceUSD;
          }

          return {
            ...prod,
            stock: (Number(prod.stock) || 0) + addedQty,
            costUSD: newCostUSD,
            costVES: newCostVES,
            costExchangeUSD: newCostUSD,
            priceUSD: newPriceUSD,
            priceVES: newPriceVES,
            updatedAt: new Date().toISOString()
          };
        }
        return prod;
      });
      return updated;
    });

    const log: SyncLog = {
      id: 'log-' + Date.now(),
      timestamp: new Date().toISOString(),
      action: "Surtido Compra",
      details: `Reabastecidos ítems por un monto de ${newPurchase.totalUSD.toFixed(2)}$ con el proveedor "${newPurchase.supplierName}".`,
      synced: isOnline,
      user: currentUser.username
    };
    setSyncLogs([log, ...syncLogs]);
  };

  // Callback for adding an operation or sync log
  const handleAddSyncLog = (action: string, details: string) => {
    const log: SyncLog = {
      id: 'log-' + Date.now(),
      timestamp: new Date().toISOString(),
      action,
      details,
      synced: true,
      user: currentUser.username
    };
    setSyncLogs(prev => [log, ...prev]);
  };

  // Full reset function for Commercial History, Purchases and Analytics back to 0
  const handleResetCommercialHistory = async () => {
    if (currentUser.role !== 'Administrador') {
      alert("⛔ Permiso Denegado: Solo los usuarios con rol de Administrador tienen autorización para reiniciar el histórico a 0.");
      return;
    }

    const emptyTransactions: Transaction[] = [];
    const emptyPurchases: Purchase[] = [];
    const resetSeq = {
      factura: 0,
      recibo: 0,
      cotizacion: 0,
      consignacion: 0
    };

    setTransactions(emptyTransactions);
    setPurchases(emptyPurchases);
    setSequences(resetSeq);

    localStorage.setItem('siga_transactions', JSON.stringify([]));
    localStorage.setItem('siga_purchases', JSON.stringify([]));
    localStorage.setItem('siga_sequences', JSON.stringify(resetSeq));

    // Call server reset API for instant synchronization and persistence
    fetch('/api/reset-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: currentUser })
    }).catch(console.warn);

    if (isOnline && !isQuotaExceeded()) {
      try {
        const trxDocs = await getDocs(collection(db, 'transactions'));
        trxDocs.forEach(d => {
          deleteDoc(doc(db, 'transactions', d.id)).catch(err => checkQuotaError(err));
        });

        const purDocs = await getDocs(collection(db, 'purchases'));
        purDocs.forEach(d => {
          deleteDoc(doc(db, 'purchases', d.id)).catch(err => checkQuotaError(err));
        });

        syncSingleDoc('settings', 'sequences', resetSeq).catch(err => checkQuotaError(err));
      } catch (err) {
        checkQuotaError(err);
        console.warn("Firestore history purge notice:", err);
      }
    }

    handleAddSyncLog('Puesta a Cero', `${currentUser.username} restableció el Histórico Comercial, Compras y Analíticas a 0.`);
  };

  useEffect(() => {
    try {
      localStorage.setItem('siga_transactions', JSON.stringify(transactions));
    } catch (e) {}
  }, [transactions]);

  useEffect(() => {
    try {
      localStorage.setItem('siga_purchases', JSON.stringify(purchases));
    } catch (e) {}
  }, [purchases]);

  // Startup initialization: verify Firestore connection and ensure 0 demo products
  useEffect(() => {
    // 1. Verify Firestore connection
    testFirestoreConnection();

    // 2. Clean legacy demo products from cache to guarantee a completely clean slate for migration
    const purgeDemoProductsOnStartup = () => {
      const DEMO_BARCODES = ["7591001002221", "7591234560021", "7501055306612", "7591004128959", "0784343105741", "6901234567890"];
      
      // Clean from localStorage if lingering
      const cached = localStorage.getItem('siga_products');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.some(p => DEMO_BARCODES.includes(p.id))) {
            const cleaned = parsed.filter(p => !DEMO_BARCODES.includes(p.id));
            localStorage.setItem('siga_products', JSON.stringify(cleaned));
            setProducts(cleaned);
          }
        } catch (e) {}
      }
    };

    purgeDemoProductsOnStartup();
  }, [isOnline]);

  // If not logged in, force showing LoginModule
  if (!isLoggedIn) {
    return (
      <LoginModule
        onLoginSuccess={handleLoginSuccess}
        exchangeRate={exchangeRate}
      />
    );
  }

  return (
    <>
      <Dashboard
        theme={theme}
        setTheme={setTheme}
        products={products}
        setProducts={updateProducts}
        exchangeRate={exchangeRate}
        setExchangeRate={updateExchangeRate}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        users={users}
        transactions={transactions}
        setTransactions={updateTransactions}
        purchases={purchases}
        setPurchases={updatePurchases}
        companySettings={companySettings}
        setCompanySettings={updateCompanySettings}
        isOnline={isOnline}
        setIsOnline={setIsOnline}
        syncLogs={syncLogs}
        setSyncLogs={setSyncLogs}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenScanner={handleOpenScanner}
        activeSessions={activeSessions}
        liveActivities={liveActivities}
        clients={clients}
        suppliers={suppliers}
        quotaExceeded={quotaExceeded}
      >
        {/* Render Active View Port Component inside dashboard frame */}
        
        {activeTab === 'billing' && (
          <BillingModule
            products={products}
            clients={clients}
            setClients={updateClients}
            exchangeRate={exchangeRate}
            companySettings={companySettings}
            currentUser={currentUser}
            onAddTransaction={handleAddTransaction}
            onOpenScanner={handleOpenScanner}
            isOnline={isOnline}
            consignmentItems={consignmentItems}
            sequences={sequences}
            transactions={transactions}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryModule
            products={products}
            setProducts={updateProducts}
            exchangeRate={exchangeRate}
            currentUser={currentUser}
            onOpenScanner={handleOpenScanner}
            consignmentItems={consignmentItems}
            setConsignmentItems={updateConsignmentItems}
            clients={clients}
          />
        )}

        {activeTab === 'purchases' && (
          <PurchasesModule
            products={products}
            setProducts={updateProducts}
            exchangeRate={exchangeRate}
            currentUser={currentUser}
            onAddPurchase={handleAddPurchase}
            suppliers={suppliers}
            setSuppliers={updateSuppliers}
            purchases={purchases}
            setPurchases={updatePurchases}
            companySettings={companySettings}
          />
        )}

        {activeTab === 'clients' && (
          <ClientsModule
            clients={clients}
            setClients={updateClients}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'suppliers' && (
          <SuppliersModule
            suppliers={suppliers}
            setSuppliers={updateSuppliers}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsModule
            transactions={transactions}
            purchases={purchases}
            products={products}
            exchangeRate={exchangeRate}
          />
        )}

        {activeTab === 'historico' && (
          <HistoricoModule
            transactions={transactions}
            setTransactions={updateTransactions}
            exchangeRate={exchangeRate}
            companySettings={companySettings}
            currentUser={currentUser}
            onResetCommercialHistory={handleResetCommercialHistory}
          />
        )}

        {activeTab === 'staff' && (
          <StaffModule
            users={users}
            setUsers={updateUsers}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsModule
            currentUser={currentUser}
            onUpdateProfile={handleUpdateProfile}
            companySettings={companySettings}
            onUpdateCompany={handleUpdateCompany}
            onLogout={handleLogout}
            exchangeRate={exchangeRate}
            products={products}
            setProducts={updateProducts}
            clients={clients}
            setClients={updateClients}
            suppliers={suppliers}
            setSuppliers={updateSuppliers}
            transactions={transactions}
            setTransactions={updateTransactions}
            purchases={purchases}
            setPurchases={updatePurchases}
            users={users}
            setUsers={updateUsers}
            isOnline={isOnline}
            onAddSyncLog={handleAddSyncLog}
            onResetCommercialHistory={handleResetCommercialHistory}
          />
        )}

        {activeTab === 'about' && (
          <AboutModule
            companySettings={companySettings}
            currentUser={currentUser}
          />
        )}
      </Dashboard>

      {/* GLOBAL HIGH-FIDELITY CAM CAMERA BARCODE SCANNER MODAL */}
      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={onScanSuccessCallback}
        products={products}
      />
    </>
  );
}
