import { supabase, getCurrentOrgId } from "@/lib/supabase";
import { calculateInvoice, type InvoiceCalculation } from "@/lib/calculations";
import { IGV_RATE } from "@/lib/constants/tax";
import { auditService } from "@/services/audit.service";
import type { Invoice, InvoiceItem, InvoiceFormData, SalesChannel } from "@/lib/types";

const VALID_INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ["issued", "cancelled"],
  issued: ["accepted", "cancelled"],
  accepted: ["paid", "cancelled"],
  paid: ["cancelled"],
  cancelled: [],
};

export const invoiceService = {
  async getAll(): Promise<Invoice[]> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("invoices")
      .select("*, customer:customers(id, name, document_number, document_type), items:invoice_items(*)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async getById(id: string): Promise<Invoice | null> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("invoices")
      .select("*, customer:customers(id, name, document_number, document_type), items:invoice_items(*)")
      .eq("organization_id", orgId)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async getByBranch(branchId: string): Promise<Invoice[]> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("invoices")
      .select("*, customer:customers(id, name, document_number, document_type), items:invoice_items(*)")
      .eq("organization_id", orgId)
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async getNextCorrelativo(serie: string): Promise<number> {
    const orgId = await getCurrentOrgId();

    const { data, error } = await supabase.rpc("get_next_correlativo", {
      p_organization_id: orgId,
      p_serie: serie,
    });
    if (error) throw error;
    return data;
  },

  async createWithItems(
    formData: InvoiceFormData,
    branchId: string,
    paymentMethod: string | null,
    registerId: string | null,
    referenceInvoiceId?: string | null,
    salesChannel: SalesChannel = "admin_manual",
    sourceOrderId?: string | null
  ): Promise<{ id: string; serie: string; correlativo: number }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    const orgId = await getCurrentOrgId();

    const { data: branchData, error: branchError } = await supabase
      .from("branches")
      .select("invoice_serie_prefix")
      .eq("id", branchId)
      .single();
    if (branchError) throw branchError;

    const defaultSerie = formData.invoice_type === "factura" ? "F001" : "B001";
    const configuredSerie = branchData?.invoice_serie_prefix?.trim().toUpperCase();
    const serie = configuredSerie && /^[FB][A-Z0-9]{3}$/.test(configuredSerie)
      && (formData.invoice_type === "factura" || formData.invoice_type === "boleta")
      ? `${defaultSerie[0]}${configuredSerie.slice(1)}`
      : configuredSerie || defaultSerie;

    const calc: InvoiceCalculation = calculateInvoice(formData.items);

    const rpcItems = calc.items.map((item) => ({
      product_id: item.product_id || null,
      product_name: item.product_name,
      product_sku: item.product_sku || null,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      discount_percent: item.discount_percent,
      discount_cents: item.discount_cents,
      line_total_cents: item.line_total_cents,
      tax_affectation: item.tax_affectation,
      igv_cents: item.igv_cents,
    }));

    const MAX_RETRIES = 3;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const correlativo = await this.getNextCorrelativo(serie);

      const rpcParams = {
        p_organization_id: orgId,
        p_serie: serie,
        p_correlativo: correlativo,
        p_invoice_type: formData.invoice_type,
        p_customer_id: formData.customer_id,
        p_branch_id: branchId,
        p_subtotal_cents: calc.subtotal_cents,
        p_gravada_cents: calc.gravada_cents,
        p_exonerada_cents: calc.exonerada_cents,
        p_inafecta_cents: calc.inafecta_cents,
        p_exportacion_cents: calc.exportacion_cents,
        p_igv_rate: IGV_RATE,
        p_igv_cents: calc.igv_cents,
        p_total_cents: calc.total_cents,
        p_payment_method: paymentMethod,
        p_register_id: registerId,
        p_notes: formData.notes || null,
        p_created_by: user.id,
        p_reference_invoice_id: referenceInvoiceId || null,
        p_items: rpcItems,
        p_sales_channel: salesChannel,
        p_source_order_id: sourceOrderId || null,
      };

      let { data, error } = await supabase.rpc("create_invoice_with_items", rpcParams);

      if (
        error &&
        (error.code === "PGRST202" ||
          error.message?.includes("p_sales_channel") ||
          error.message?.includes("p_source_order_id"))
      ) {
        const legacyParams: Record<string, unknown> = { ...rpcParams };
        delete legacyParams.p_sales_channel;
        delete legacyParams.p_source_order_id;
        ({ data, error } = await supabase.rpc("create_invoice_with_items", legacyParams));
      }

      if (!error) {
        auditService.log("invoice.create", "invoice", data, undefined, {
          serie,
          correlativo,
          total_cents: calc.total_cents,
        });
        return { id: data, serie, correlativo };
      }

      lastError = error;
      if (error.message?.includes("Stock insuficiente")) {
        throw new Error(
          `Stock insuficiente en sede. Otro cajero pudo haber vendido el producto. ${error.message.replace(/.*Stock insuficiente/, "Stock insuficiente")}`
        );
      }
      const isDuplicate = error.code === "23505" || error.message?.includes("duplicate key") || error.message?.includes("unique constraint") || error.message?.includes("correlativo");
      if (!isDuplicate || attempt === MAX_RETRIES - 1) throw error;
    }
    throw lastError;
  },

  async updateStatus(id: string, status: string): Promise<void> {
    if (!VALID_INVOICE_TRANSITIONS[status]) {
      throw new Error(`Estado de factura inválido: ${status}`);
    }
    const orgId = await getCurrentOrgId();
    const { data: current } = await supabase
      .from("invoices")
      .select("status")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();
    if (!current) throw new Error("Factura no encontrada");
    const allowed = VALID_INVOICE_TRANSITIONS[current.status] || [];
    if (!allowed.includes(status)) {
      throw new Error(`Transición no permitida: ${current.status} → ${status}`);
    }
    const { error } = await supabase
      .from("invoices")
      .update({ status })
      .eq("id", id)
      .eq("organization_id", orgId);
    if (error) throw error;
    const action = status === "cancelled" ? "invoice.cancel" : "invoice.status_change";
    auditService.log(action, "invoice", id, { status: current.status }, { status });
  },

  async getItems(invoiceId: string): Promise<InvoiceItem[]> {
    const orgId = await getCurrentOrgId();
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id")
      .eq("id", invoiceId)
      .eq("organization_id", orgId)
      .single();
    if (!invoice) throw new Error("Factura no encontrada");
    const { data, error } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at");
    if (error) throw error;
    return data;
  },

  async createCreditNote(params: {
    parentInvoiceId: string;
    items: Array<{
      product_id: string | null;
      product_name: string;
      product_sku: string | null;
      quantity: number;
      unit_price_cents: number;
      discount_percent: number;
      discount_cents: number;
      line_total_cents: number;
      tax_affectation: string;
      igv_cents: number;
    }>;
    motivo: string;
    descripcion: string;
    branchId: string;
  }): Promise<{ invoice_id: string; serie: string; correlativo: number }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");

    const orgId = await getCurrentOrgId();

    const { data, error } = await supabase.rpc("create_credit_note", {
      p_organization_id: orgId,
      p_parent_invoice_id: params.parentInvoiceId,
      p_items: params.items,
      p_motivo_nota: params.motivo,
      p_descripcion_motivo: params.descripcion,
      p_branch_id: params.branchId,
      p_created_by: user.id,
    });

    if (error) throw error;

    auditService.log("credit_note.create", "invoice", data?.invoice_id, undefined, {
      parent_invoice: params.parentInvoiceId,
      motivo: params.motivo,
    });

    return data;
  },

  async getLinkedCreditNotes(invoiceId: string): Promise<Invoice[]> {
    const orgId = await getCurrentOrgId();
    const { data, error } = await supabase
      .from("invoices")
      .select("*, customer:customers(id, name, document_number, document_type), items:invoice_items(*)")
      .eq("organization_id", orgId)
      .eq("reference_invoice_id", invoiceId);
    if (error) throw error;
    return data || [];
  },
};
