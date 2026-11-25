import { supabase, getCurrentOrgId } from "@/lib/supabase";
import { buildUpdatePayload } from "@/lib/utils";
import type { Branch, BranchStock, BranchFormData } from "@/lib/types";
import { isUbigeoSelva } from "@/lib/tax-engine";

function computeIsSelva(data: Partial<BranchFormData>): boolean {
  return isUbigeoSelva(
    data.department_code || "",
    data.province_code || "",
    data.district_code,
  );
}

export const branchService = {
  async setStockLimits(branchId: string, productId: string, minStock: number, maxStock: number): Promise<void> {
    const { error } = await supabase.from("branch_stock").upsert({ branch_id: branchId, product_id: productId, min_stock: minStock, max_stock: maxStock }, { onConflict: "branch_id,product_id" });
    if (error) throw error;
  },
  async getAll(): Promise<Branch[]> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data;
  },

  async getById(id: string): Promise<Branch | null> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(formData: BranchFormData): Promise<Branch> {
    const organization_id = await getCurrentOrgId();
    const is_selva_zone = computeIsSelva(formData);
    const { data, error } = await supabase
      .from("branches")
      .insert({
        organization_id,
        name: formData.name,
        code: formData.code.toUpperCase(),
        type: formData.type,
        address: formData.address || null,
        phone: formData.phone || null,
        department_code: formData.department_code || "",
        province_code: formData.province_code || "",
        district_code: formData.district_code || "",
        stock_source_branch_id: formData.stock_source_branch_id || null,
        is_selva_zone,
        is_active: true,
        is_default: false,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, formData: Partial<BranchFormData>): Promise<Branch> {
    const orgId = await getCurrentOrgId();
    const updateData = buildUpdatePayload(formData, [
      "name", "code", "type", "address", "phone",
      "department_code", "province_code", "district_code", "stock_source_branch_id",
    ]);
    if (updateData.code !== undefined) updateData.code = (updateData.code as string).toUpperCase();
    if (updateData.stock_source_branch_id === "") updateData.stock_source_branch_id = null;

    if (formData.department_code !== undefined || formData.province_code !== undefined || formData.district_code !== undefined) {
      updateData.is_selva_zone = computeIsSelva({
        department_code: formData.department_code,
        province_code: formData.province_code,
        district_code: formData.district_code,
      });
    }

    const { data, error } = await supabase
      .from("branches")
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

    const { data: stock, error: stockError } = await supabase
      .from("branch_stock")
      .select("id, products!inner(is_active)")
      .eq("branch_id", id)
      .gt("stock", 0)
      .eq("products.is_active", true);
    if (stockError) throw stockError;
    if (stock && stock.length > 0) {
      throw new Error("No se puede eliminar una sede con stock activo. Transfiere el stock primero.");
    }

    const { data: openRegisters, error: regError } = await supabase
      .from("cash_registers")
      .select("id")
      .eq("branch_id", id)
      .eq("status", "open")
      .limit(1);
    if (regError) throw regError;
    if (openRegisters && openRegisters.length > 0) {
      throw new Error("No se puede eliminar una sede con cajas abiertas. Cierra las cajas primero.");
    }

    const { error } = await supabase
      .from("branches")
      .update({ is_active: false })
      .eq("id", id)
      .eq("organization_id", orgId);
    if (error) throw error;
  },

  async getStock(branchId: string): Promise<BranchStock[]> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("branch_stock")
      .select("*, branches!inner(organization_id)")
      .eq("branch_id", branchId)
      .eq("branches.organization_id", orgId);
    if (error) throw error;
    const all = (data || []) as Record<string, unknown>[];
    return all.map((row: Record<string, unknown>) => {
      const { branches: _, ...stock } = row;
      return stock as unknown as BranchStock;
    });
  },

  async getAllStock(): Promise<BranchStock[]> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("branch_stock")
      .select("*, branches!inner(organization_id), products!inner(organization_id)")
      .eq("branches.organization_id", orgId)
      .eq("products.organization_id", orgId);
    if (error) throw error;
    const all = (data || []) as Record<string, unknown>[];
    return all.map((row: Record<string, unknown>) => {
      const { branches: _b, products: _p, ...stock } = row;
      return stock as unknown as BranchStock;
    });
  },

  async setDefault(id: string): Promise<void> {
    const orgId = await getCurrentOrgId();

    const { error: clearError } = await supabase
      .from("branches")
      .update({ is_default: false })
      .eq("organization_id", orgId)
      .neq("id", id);
    if (clearError) throw clearError;

    const { error } = await supabase
      .from("branches")
      .update({ is_default: true })
      .eq("id", id);
    if (error) throw error;
  },
};
