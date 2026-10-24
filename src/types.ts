/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id: string; // This can be the barcode or a custom code
  name: string;
  category: string;
  sku: string;
  costUSD: number;
  costExchangeUSD?: number; // Costo al cambio USD
  costVES?: number; // Costo en Bs
  priceUSD: number; // Precio Detal USD
  priceVES?: number; // Precio Detal Bs
  priceWholesaleUSD?: number; // Precio Mayor USD
  priceWholesaleVES?: number; // Precio Mayor Bs
  priceCuadrillasUSD?: number; // Precio Cuadrillas
  priceCuadrillasVES?: number; // Precio Cuadrillas Bs (Opcional)
  priceCuadrillasDetalUSD?: number; // Precio Detal para Cuadrillas (kept for compatibility)
  priceMayorDetalUSD?: number; // Precio Mayor Detal (kept for compatibility)
  binLocation?: string; // Ubicacion BIN
  stock: number;
  minStock: number;
  description?: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeRate {
  rate: number; // e.g. 41.20 BS per USD
  lastUpdated: string;
  source: string; // e.g. "BCV (Banco Central de Venezuela)"
}

export type UserRole = 'Administrador' | 'Vendedor' | 'Almacenista' | 'Supervisor' | 'Solo Lectura';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  passwordHash?: string; // Simulated encryption
  avatarUrl?: string; // Base64 or placeholder URL
  nombreCompleto?: string;
  telefono?: string;
}

export type TransactionType = 'factura' | 'cotizacion' | 'recibo' | 'consignacion';

export interface TransactionItem {
  productId: string;
  name: string;
  qty: number;
  priceUSD: number;
  priceVES: number;
  totalUSD: number;
  totalVES: number;
}

export interface Transaction {
  id: string; // e.g. FAC-0001
  type: TransactionType;
  clientName: string;
  clientRif: string; // e.g. J-12345678-9, V-12345678
  clientPhone?: string;
  clientEmail?: string;
  items: TransactionItem[];
  subtotalUSD: number;
  subtotalVES: number;
  ivaPercent: number; // e.g. 16% (Venezuela VAT/IVA)
  ivaUSD: number;
  ivaVES: number;
  igtfPercent: number; // e.g. 3% for USD cash payments under IGTF
  igtfUSD: number;
  igtfVES: number;
  totalUSD: number;
  totalVES: number;
  exchangeRateUsed: number;
  paymentMethod: 'Dólares Efectivo' | 'Bolívares Pago Móvil' | 'Bolívares Transferencia' | 'Punto de Venta' | 'Zelle' | 'Binance' | 'Zinli' | 'Otro (Divisas)' | 'Consignación Abierta' | string;
  status: 'completado' | 'pendiente' | 'anulado';
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledByName?: string;
  cancelledById?: string;
  createdById: string; // ID of the user who made it
  createdByName: string; // name for easy reading
  timestamp: string;
  additionalNotes?: string;
  inventorySource?: 'general' | 'consignacion';
}

export interface Purchase {
  id: string; // Ej: COM-2099
  supplierName: string;
  supplierRif?: string;
  items: {
    productId: string;
    sku?: string;
    name: string;
    qty: number;
    costUSD: number;
    costVES?: number;
    totalUSD: number;
    totalVES?: number;
    priceUpdate?: number; // Optional new pricing updated upon buy
    priceUpdateVES?: number;
  }[];
  totalUSD: number;
  totalVES: number;
  exchangeRateUsed: number;
  timestamp: string;
  createdById: string;
  createdByName: string;
}

export interface Client {
  id: string;
  name: string;
  rif: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface Supplier {
  id: string;
  name: string;
  rif: string;
  phone?: string;
  email?: string;
  address?: string;
  contactPerson?: string;
}

export interface CompanySettings {
  name: string;
  rif: string;
  phone: string;
  email: string;
  address: string;
  logoUrl?: string; // Base64 or standard URL
  ivaRate: number; // 16
  igtfRate: number; // 3
}

export interface SyncLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  synced: boolean;
  user: string;
}

export interface ConsignmentItem {
  id: string; // clientRif + "_" + productId
  clientRif: string;
  clientName: string;
  productId: string;
  productName: string;
  qty: number;
  updatedAt: string;
  createdByName?: string;
  documentId?: string;
}
