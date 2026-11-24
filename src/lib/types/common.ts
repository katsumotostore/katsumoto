// ---------- Primitives ----------
export type Cents = number;

// ---------- Enums / Unions ----------
export type UserRole = "owner" | "admin" | "cashier" | "inventory" | "vendedor" | "reader";
export type DocumentType = "RUC" | "DNI" | "Pasaporte" | "CE" | "Otros";
export type TaxAffectation = "gravado" | "exonerado" | "inafecto" | "exportacion";

// ---------- Hierarchical Categories ----------
export type ProductFamily = "productos" | "servicios";
export type CategoryGroup = string;

// ---------- Organization ----------
export interface Organization {
  id: string;
  name: string;
  slug: string;
  ruc: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_rate: number;
  currency: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Profile ----------
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  organization_id: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
