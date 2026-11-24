import { supabase } from "@/lib/supabase";
import type { PriceTier, Product } from "@/lib/types";
import type { Branch, BranchStock } from "@/lib/types";

export const storePublicService = {
  async getBranches(): Promise<Branch[]> {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data;
  },

  async getProducts(): Promise<Product[]> {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, description, price_cents, image_url, unit, category_id, category, category_group, product_family, tags, is_active, tax_affectation")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data.map((p: Record<string, unknown>) => ({ ...p, stock: (p as Record<string, unknown>).stock ?? 0 } as Product));
  },

  async getPriceTiers(): Promise<PriceTier[]> {
    const { data, error } = await supabase
      .from("price_tiers")
      .select("id, product_id, min_quantity, price_cents, label")
      .order("min_quantity");
    if (error) throw error;
    return (data || []) as PriceTier[];
  },

  async getBranchStock(): Promise<BranchStock[]> {
    const { data, error } = await supabase
      .from("branch_stock")
      .select("*");
    if (error) throw error;
    return data || [];
  },

  async createOrder(data: {
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    customerDocumentType: string;
    customerDocumentNumber: string;
    branchId: string;
    shippingAddress?: string;
    shippingDepartmentCode?: string;
    shippingProvinceCode?: string;
    shippingDistrictCode?: string;
    notes?: string;
    items: Array<{
      productId: string;
      productName: string;
      productSku: string;
      quantity: number;
      taxAffectation: string;
    }>;
  }): Promise<string> {
    const { data: orderId, error } = await supabase.rpc("create_store_order", {
      p_order_number: data.orderNumber,
      p_customer_name: data.customerName,
      p_customer_phone: data.customerPhone,
      p_customer_email: data.customerEmail,
      p_customer_document_type: data.customerDocumentType,
      p_customer_document_number: data.customerDocumentNumber,
      p_branch_id: data.branchId,
      p_shipping_address: data.shippingAddress || null,
      p_shipping_department_code: data.shippingDepartmentCode || "",
      p_shipping_province_code: data.shippingProvinceCode || "",
      p_shipping_district_code: data.shippingDistrictCode || "",
      p_notes: data.notes || null,
      p_items: data.items.map((item) => ({
        product_id: item.productId,
        product_name: item.productName,
        product_sku: item.productSku,
        quantity: item.quantity,
        tax_affectation: item.taxAffectation,
      })),
    });
    if (error) throw error;
    return orderId;
  },
};
