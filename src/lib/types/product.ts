import type { Cents, TaxAffectation, ProductFamily, CategoryGroup } from "./common";

// ---------- Product ----------
export interface Product {
  id: string;
  organization_id: string;
  name: string;
  sku: string;
  barcode: string;
  product_family: ProductFamily;
  category_group: CategoryGroup;
  category: string;
  category_id?: string | null;
  description: string | null;
  unit: string;
  price_cents: Cents;
  cost_cents: Cents;
  stock: number;
  min_stock: number;
  max_stock: number;
  supplier: string | null;
  image_url: string | null;
  tax_affectation: TaxAffectation;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductFormData {
  name: string;
  sku: string;
  product_family: ProductFamily;
  category_group: CategoryGroup;
  category: string;
  category_id?: string | null;
  description?: string;
  unit: string;
  price_cents: Cents;
  cost_cents: Cents;
  stock: number;
  min_stock: number;
  max_stock: number;
  supplier?: string;
  image_url?: string | null;
  tax_affectation: TaxAffectation;
  tags?: string[];
}

// ---------- Price Tier (Escalas por Volumen) ----------
export interface PriceTier {
  id: string;
  product_id: string;
  min_quantity: number;
  price_cents: Cents;
  label: string;
}

// ---------- Product-Machine Compatibility ----------
export interface ProductMachineModel {
  id: string;
  product_id: string;
  machine_model_id: string;
}

// ---------- Dynamic Category Management ----------
export interface ManagedCategoryFamily {
  isActive?: boolean;
  id: string;
  key: string;
  label: string;
  icon: string;
  color: string;
  activeColor: string;
  order: number;
}

export interface ManagedCategoryGroup {
  isActive?: boolean;
  id: string;
  familyId: string;
  key: string;
  label: string;
  icon: string;
  color: string;
  order: number;
}

export interface ManagedCategory {
  isActive?: boolean;
  id: string;
  groupId: string;
  name: string;
  order: number;
  imageUrl: string | null;
}
