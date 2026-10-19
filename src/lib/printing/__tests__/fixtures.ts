import type { Invoice } from "../../types";
import type { SellerInfo } from "../seller-info";

export const seller: SellerInfo = {
  ruc: "20608183672", razonSocial: "SERVICIOS GENERALES UNITED E.I.R.L.",
  nombreComercial: "KATSUMOTO", direccion: "Av. de prueba 123 - Documento de muestra",
  departamento: "Junin", provincia: "Chanchamayo", distrito: "Pichanaqui",
  ubigeo: "120303", phone: "999 000 000", email: "ejemplo@example.com",
  ticketFooter: "Gracias por su compra. Conserve su comprobante.",
};

export function sampleInvoice(count = 3): Invoice {
  const items: NonNullable<Invoice["items"]> = Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`, invoice_id: "sample", product_id: null,
    product_name: ["Aceite 2T Castrol 500ml", "Cadena de corte profesional para motosierra de 20 pulgadas", "Kit de mantenimiento para motor agricola - filtro y empaques"][i % 3],
    product_sku: `REP-${String(i + 1).padStart(4, "0")}`, quantity: 2,
    unit_price_cents: 2500, discount_percent: 10, discount_cents: 500,
    line_total_cents: 4500, tax_affectation: "exonerado", igv_cents: 0, created_at: "2026-10-18",
  }));
  return {
    id: "sample", organization_id: "sample", number: "F001-000003", serie: "F001", correlativo: 3,
    invoice_type: "factura", customer_id: "sample", branch_id: "sample", status: "issued",
    issue_date: "2026-10-18", due_date: null, subtotal_cents: count * 4500,
    gravada_cents: 0, exonerada_cents: count * 4500, inafecta_cents: 0, exportacion_cents: 0,
    igv_rate: 0.18, igv_cents: 0, total_cents: count * 4500,
    notes: "DOCUMENTO DE MUESTRA SIN VALIDEZ TRIBUTARIA. Entrega en almacen central.",
    created_by: null, created_at: "2026-10-18", updated_at: "2026-10-18", items,
    payment_method: "cash", customer: { id: "sample", name: "CLIENTE DE DEMOSTRACION - REPUESTOS Y SERVICIOS AGRICOLAS DEL PERU S.A.C.", document_type: "RUC", document_number: "20000000001" },
    sunat_hash: "DEMO0123456789abcdefghijklmnopqrstuvwxyzABCDEFG=",
  };
}
