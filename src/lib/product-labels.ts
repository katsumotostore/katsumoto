import { isValidEAN13 } from "./barcode";
import type { Product } from "./types";

export type BarcodeStatus = "ready" | "missing" | "review";

export interface BarcodeConflict {
  product_id: string;
  other_id: string;
  other_name: string;
  other_sku: string;
  other_active: boolean;
}

export function barcodeStatus(product: Pick<Product, "barcode">, products: Pick<Product, "barcode">[], hasConflict = false): BarcodeStatus {
  if (!product.barcode?.trim()) return "missing";
  if (!isValidEAN13(product.barcode) || hasConflict || products.filter(p => p.barcode === product.barcode).length > 1) return "review";
  return "ready";
}
