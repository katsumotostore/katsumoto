import { supabase, getCurrentOrgId } from "@/lib/supabase";
import { buildUpdatePayload } from "@/lib/utils";
import type { BarcodeConflict } from "@/lib/product-labels";
import type { Product, ProductFormData, PriceTier, ProductMachineModel } from "@/lib/types";

export const productService = {
  async barcodeConflicts(): Promise<BarcodeConflict[]> {
    const { data, error } = await supabase.rpc("product_barcode_conflicts");
    if (error) throw new Error(error.message);
    return data as BarcodeConflict[];
  },
  async repairBarcode(product: Product, newBarcode: string | null): Promise<Product> {
    const { data, error } = await supabase.rpc("repair_product_barcode", {
      p_product_id: product.id, p_expected_barcode: product.barcode, p_new_barcode: newBarcode,
    }).single();
    if (error) throw new Error(error.message);
    return data as Product;
  },
  async prepareLabels(productIds: string[]): Promise<Product[]> {
    const { data, error } = await supabase.rpc("prepare_product_labels", { p_product_ids: productIds });
    if (error) throw new Error(error.message);
    return data as Product[];
  },
  async getAll(): Promise<Product[]> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data.map((p: Record<string, unknown>) => ({ ...p, stock: (p as Record<string, unknown>).stock ?? 0 } as Product));
  },

  async getById(id: string): Promise<Product | null> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(formData: ProductFormData): Promise<Product> {
    const organization_id = await getCurrentOrgId();
    const { data: existingSku } = await supabase
      .from("products")
      .select("id, name")
      .eq("organization_id", organization_id)
      .eq("sku", formData.sku)
      .eq("is_active", true)
      .maybeSingle();
    if (existingSku) {
      throw new Error(`Ya existe un producto con SKU "${formData.sku}": ${existingSku.name}`);
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        organization_id,
        name: formData.name,
        sku: formData.sku,
        product_family: formData.product_family,
        category_group: formData.category_group,
        category: formData.category,
        description: formData.description || null,
        unit: formData.unit,
        price_cents: formData.price_cents,
        cost_cents: formData.cost_cents,
        min_stock: formData.min_stock,
        max_stock: formData.max_stock,
        supplier: formData.supplier || null,
        tax_affectation: formData.tax_affectation,
        image_url: formData.image_url || null,
        tags: formData.tags || [],
        is_active: true,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, formData: Partial<ProductFormData>): Promise<Product> {
    const orgId = await getCurrentOrgId();
    if (formData.sku) {
      const { data: existingSku } = await supabase
        .from("products")
        .select("id, name")
        .eq("organization_id", orgId)
        .eq("sku", formData.sku)
        .eq("is_active", true)
        .neq("id", id)
        .maybeSingle();
      if (existingSku) {
        throw new Error(`Ya existe un producto con SKU "${formData.sku}": ${existingSku.name}`);
      }
    }

    const updateData = buildUpdatePayload(formData, [
      "name", "sku", "product_family", "category_group", "category",
      "description", "unit", "price_cents", "cost_cents",
      "min_stock", "max_stock", "supplier", "tax_affectation", "image_url", "tags",
    ]);

    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", orgId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const orgId = await getCurrentOrgId();
    const { error } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", id)
      .eq("organization_id", orgId);
    if (error) throw error;
  },

  async getAllPriceTiers(): Promise<PriceTier[]> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("price_tiers")
      .select("*, products!inner(organization_id)")
      .eq("products.organization_id", orgId)
      .order("min_quantity");
    if (error) throw error;
    return (data || []).map((row: Record<string, unknown>) => {
      const { products: _, ...tier } = row;
      return tier as unknown as PriceTier;
    });
  },

  async getPriceTiers(productId: string): Promise<PriceTier[]> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("price_tiers")
      .select("*, products!inner(organization_id)")
      .eq("product_id", productId)
      .eq("products.organization_id", orgId)
      .order("min_quantity");
    if (error) throw error;
    return (data || []).map((row: Record<string, unknown>) => {
      const { products: _, ...tier } = row;
      return tier as unknown as PriceTier;
    });
  },

  async savePriceTiers(productId: string, tiers: Omit<PriceTier, "id">[]): Promise<PriceTier[]> {
    const orgId = await getCurrentOrgId();
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("organization_id", orgId)
      .single();
    if (!product) throw new Error("Producto no encontrado en la organización actual");

    const { error: deleteError } = await supabase
      .from("price_tiers")
      .delete()
      .eq("product_id", productId);
    if (deleteError) throw deleteError;

    if (tiers.length === 0) return [];

    const { data, error } = await supabase
      .from("price_tiers")
      .upsert(
        tiers.map((t) => ({
          product_id: productId,
          min_quantity: t.min_quantity,
          price_cents: t.price_cents,
          label: t.label,
        })),
        { onConflict: "product_id,min_quantity" }
      )
      .select();
    if (error) throw error;
    return data;
  },

  async batchCreate(items: ProductFormData[]): Promise<{ success: number; errors: string[]; createdProducts: { id: string; sku: string; name: string }[] }> {
    const organization_id = await getCurrentOrgId();
    const errors: string[] = [];
    const allCreated: { id: string; sku: string; name: string }[] = [];

    const skusInBatch = items.map((item) => item.sku);
    const duplicateSkusInBatch = skusInBatch.filter((sku, idx) => skusInBatch.indexOf(sku) !== idx);
    if (duplicateSkusInBatch.length > 0) {
      const unique = [...new Set(duplicateSkusInBatch)];
      errors.push(`SKUs duplicados dentro del archivo: ${unique.join(", ")}`);
    }

    const { data: existingProducts } = await supabase
      .from("products")
      .select("sku")
      .eq("organization_id", organization_id)
      .in("sku", skusInBatch);

    const existingSkus = new Set((existingProducts || []).map((p: Record<string, unknown>) => p.sku as string));

    const validItems = items.filter((item) => {
      if (existingSkus.has(item.sku)) {
        errors.push(`SKU "${item.sku}" ya existe en la base de datos, omitido`);
        return false;
      }
      if (duplicateSkusInBatch.includes(item.sku) && skusInBatch.indexOf(item.sku) !== items.indexOf(item)) {
        return false;
      }
      return true;
    });


    const batchSize = 50;
    for (let i = 0; i < validItems.length; i += batchSize) {
      const batch = validItems.slice(i, i + batchSize);
      const rows = batch.map((item) => {
        return {
          organization_id,
          name: item.name,
          sku: item.sku,
          product_family: item.product_family,
          category_group: item.category_group,
          category: item.category,
          description: item.description || null,
          unit: item.unit,
          price_cents: item.price_cents,
          cost_cents: item.cost_cents,
          min_stock: item.min_stock,
          max_stock: item.max_stock,
          supplier: item.supplier || null,
          tax_affectation: item.tax_affectation,
          image_url: item.image_url || null,
          tags: item.tags || [],
          is_active: true,
        };
      });

      const { data, error } = await supabase
        .from("products")
        .insert(rows)
        .select("id, sku, name");

      if (error) {
        errors.push(`Lote ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      } else {
        allCreated.push(...(data || []));
      }
    }

    return { success: allCreated.length, errors, createdProducts: allCreated };
  },

  async getMachineModels(productId: string): Promise<ProductMachineModel[]> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("product_machines")
      .select("*, machine_models!inner(organization_id)")
      .eq("product_id", productId)
      .eq("machine_models.organization_id", orgId);
    if (error) throw error;
    return (data || []).map((row: Record<string, unknown>) => {
      const { machine_models: _, ...pm } = row;
      return pm as unknown as ProductMachineModel;
    });
  },

  async saveMachineModels(productId: string, machineModelIds: string[]): Promise<void> {
    const orgId = await getCurrentOrgId();
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("organization_id", orgId)
      .single();
    if (!product) throw new Error("Producto no encontrado en la organización actual");

    const { error: deleteError } = await supabase
      .from("product_machines")
      .delete()
      .eq("product_id", productId);
    if (deleteError) throw deleteError;

    if (machineModelIds.length === 0) return;

    const { error } = await supabase
      .from("product_machines")
      .upsert(
        machineModelIds.map((mid) => ({
          product_id: productId,
          machine_model_id: mid,
        })),
        { onConflict: "product_id,machine_model_id" }
      );
    if (error) throw error;
  },
};
