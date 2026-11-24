// ── Product Schemas (Zod) ──
// Validation schemas for product-related forms

import { z } from "zod";

// ── Enums matching domain types ──
export const ProductFamilyEnum = z.enum(["productos", "servicios"]);
export const CategoryGroupEnum = z.string().trim().min(1, "Selecciona un grupo");
export const TaxAffectationEnum = z.enum([
  "gravado", "exonerado", "inafecto", "exportacion",
]);
export const MovementTypeEnum = z.enum(["in", "out", "adjustment", "transfer_out", "transfer_in", "return"]);

// ── Price Tier (form state) ──
export const tierFormSchema = z.object({
  label: z.string().min(1, "Etiqueta requerida"),
  min_quantity: z.number().int().min(2, "Mínimo 2 unidades"),
  price_soles: z.number().min(0.01, "Precio debe ser mayor a 0"),
});
export type TierFormValues = z.infer<typeof tierFormSchema>;

// ── Product Form ──
export const productFormSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(200, "Máximo 200 caracteres"),
  sku: z.string().min(1, "SKU requerido").max(50, "Máximo 50 caracteres"),
  product_family: ProductFamilyEnum,
  category_group: CategoryGroupEnum,
  category_id: z.string().uuid().nullable().optional(),
  category: z.string().min(1, "Categoría requerida"),
  description: z.string().max(500, "Máximo 500 caracteres").default(""),
  price_soles: z.preprocess((v) => (typeof v === "number" && isNaN(v) ? undefined : v), z.number().min(0.01, "Precio debe ser mayor a 0")),
  cost_soles: z.preprocess((v) => (typeof v === "number" && isNaN(v) ? 0 : v), z.number().min(0, "Costo no puede ser negativo").default(0)),
  stock: z.preprocess((v) => (typeof v === "number" && isNaN(v) ? 0 : v), z.number().int().min(0, "Stock no puede ser negativo").default(0)),
  min_stock: z.preprocess((v) => (typeof v === "number" && isNaN(v) ? 0 : v), z.number().int().min(0, "Stock mínimo no puede ser negativo").default(0)),
  max_stock: z.preprocess((v) => (typeof v === "number" && isNaN(v) ? 100 : v), z.number().int().min(0, "Stock máximo no puede ser negativo").default(100)),
  unit: z.string().min(1, "Unidad requerida").default("Unidad"),
  supplier: z.string().max(100, "Máximo 100 caracteres").default(""),
  tax_affectation: TaxAffectationEnum.default("gravado"),
  image_url: z.string().url("URL inválida").or(z.literal("")).default(""),
  tags: z.array(z.string().min(1)).default([]),
  selectedMachineIds: z.array(z.string()).default([]),
  priceTiers: z.array(tierFormSchema).default([]),
}).refine((data) => data.max_stock === 0 || data.min_stock <= data.max_stock, {
  message: "Stock mínimo no puede ser mayor que stock máximo",
  path: ["min_stock"],
}).refine((data) => data.cost_soles <= data.price_soles, {
  message: "El costo no puede ser mayor que el precio de venta",
  path: ["cost_soles"],
});
export type ProductFormValues = z.infer<typeof productFormSchema>;

// ── Stock Adjust Form ──
export const stockAdjustSchema = z.object({
  movementType: MovementTypeEnum,
  quantity: z.number().min(1, "Cantidad mínima es 1"),
  notes: z.string().max(300, "Máximo 300 caracteres").default(""),
});
export type StockAdjustValues = z.infer<typeof stockAdjustSchema>;
