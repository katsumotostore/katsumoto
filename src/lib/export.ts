import type { Product, Invoice } from "./types";
import type { BranchStock } from "./types/branch";
import { formatCents, formatDate, formatInvoiceNumber } from "./format";
import type { InvoiceType, InvoiceStatus } from "./types/invoice";

/**
 * Triggers a CSV file download in the browser.
 */
function downloadCSV(content: string, filename: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Escapes a value for CSV (handles commas, quotes, newlines).
 */
function csvEscape(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds a CSV string from headers and rows.
 */
function buildCSV(headers: string[], rows: string[][]): string {
  const headerLine = headers.join(",");
  const dataLines = rows.map((row) => row.join(","));
  return [headerLine, ...dataLines].join("\n");
}

// ==========================================
// Export Inventory to Excel
// ==========================================
export interface InventoryExportOptions {
  getMachinesForProduct: (id: string) => { name: string; brand: string; model: string }[];
  branches: { id: string; name: string }[];
  branchStocks: BranchStock[];
}

export async function exportInventoryExcel(
  products: Product[],
  options: InventoryExportOptions
) {
  const XLSX = await import("xlsx");
  const { getMachinesForProduct, branches, branchStocks } = options;

  const branchHeaders = branches.map((b) => `Stock ${b.name}`);

  const headers = [
    "SKU",
    "Código de Barras",
    "Nombre",
    "Categoría",
    "Descripción",
    "Unidad",
    "Precio Venta (S/.)",
    "Costo (S/.)",
    "Margen (%)",
    "Stock Total",
    ...branchHeaders,
    "Stock Mínimo",
    "Stock Máximo",
    "Estado Stock",
    "Afectación IGV",
    "Proveedor",
    "Máquinas Compatibles",
  ];

  const rows = products.map((p) => {
    const margin =
      p.cost_cents > 0 && p.price_cents > 0
        ? (1 - p.cost_cents / p.price_cents)
        : null;

    const stockStatus =
      p.stock === 0
        ? "Agotado"
        : p.stock <= p.min_stock
        ? "Stock Bajo"
        : p.stock > p.max_stock
        ? "Excedido"
        : "Normal";

    const machines = getMachinesForProduct(p.id);
    const machinesStr =
      machines.length > 0
        ? machines.map((m) => `${m.name} (${m.brand} ${m.model})`).join("; ")
        : "—";

    return [
      p.sku,
      p.barcode,
      p.name,
      p.category,
      p.description,
      p.unit,
      p.price_cents / 100,
      (p.cost_cents ?? 0) / 100,
      margin,
      p.stock,
      ...branches.map((b) => {
        const bs = branchStocks.find((s) => s.branch_id === b.id && s.product_id === p.id);
        return bs?.stock ?? 0;
      }),
      p.min_stock,
      p.max_stock,
      stockStatus,
      p.tax_affectation || "gravado",
      p.supplier,
      machinesStr,
    ];
  });

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map((header) => ({ wch: header === "Nombre" || header === "Descripción" || header === "Máquinas Compatibles" ? 45 : 22 }));
  sheet["!autofilter"] = { ref: sheet["!ref"]! };
  for (let row = 1; row <= rows.length; row++) {
    for (const col of [6, 7, 8]) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell?.t === "n") cell.z = col === 8 ? "0.0%" : '#,##0.00';
    }
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Inventario");
  const timestamp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  XLSX.writeFile(book, `inventario_${timestamp}.xlsx`, { compression: true });
}

// ==========================================
// Export Stock Movements to CSV
// ==========================================
export interface MovementExportRow {
  date: string;
  productName: string;
  productSku: string;
  movementType: string;
  quantity: number;
  branchName: string;
  transferToBranch: string | null;
  referenceType: string | null;
  notes: string | null;
}

export function exportMovementsCSV(movements: MovementExportRow[]) {
  const headers = [
    "Fecha",
    "Producto",
    "SKU",
    "Tipo de Movimiento",
    "Cantidad",
    "Sede",
    "Sede Destino",
    "Tipo Referencia",
    "Notas",
  ];

  const rows = movements.map((m) => [
    csvEscape(formatDate(m.date)),
    csvEscape(m.productName),
    csvEscape(m.productSku),
    csvEscape(m.movementType),
    csvEscape(m.quantity),
    csvEscape(m.branchName),
    csvEscape(m.transferToBranch || "—"),
    csvEscape(m.referenceType || "—"),
    csvEscape(m.notes || "—"),
  ]);

  const csv = buildCSV(headers, rows);
  const timestamp = new Date().toISOString().split("T")[0];
  downloadCSV(csv, `movimientos_stock_${timestamp}.csv`);
}

// ==========================================
// Export Invoices (Comprobantes) to CSV
// ==========================================

const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  factura: "Factura",
  boleta: "Boleta",
  nota_credito: "Nota de Crédito",
  nota_debito: "Nota de Débito",
};

const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Borrador",
  issued: "Emitido",
  accepted: "Aceptado SUNAT",
  paid: "Pagado",
  cancelled: "Anulado",
};

export interface InvoiceExportOptions {
  getBranchName: (id: string) => string;
}

export function exportInvoicesCSV(
  invoices: Invoice[],
  options: InvoiceExportOptions
) {
  const headers = [
    "Comprobante",
    "Tipo",
    "Estado",
    "Fecha Emisión",
    "Cliente",
    "Tipo Doc.",
    "N° Documento",
    "Sede",
    "Canal",
    "Gravada (S/.)",
    "Exonerada (S/.)",
    "Inafecta (S/.)",
    "IGV (S/.)",
    "Total (S/.)",
    "Moneda",
    "Método Pago",
    "SUNAT Hash",
    "Observaciones",
  ];

  const rows = invoices.map((inv) => [
    csvEscape(formatInvoiceNumber(inv.serie, inv.correlativo)),
    csvEscape(INVOICE_TYPE_LABELS[inv.invoice_type] || inv.invoice_type),
    csvEscape(INVOICE_STATUS_LABELS[inv.status] || inv.status),
    csvEscape(formatDate(inv.issue_date)),
    csvEscape(inv.customer?.name || "—"),
    csvEscape(inv.customer?.document_type || "—"),
    csvEscape(inv.customer?.document_number || "—"),
    csvEscape(options.getBranchName(inv.branch_id)),
    csvEscape(inv.sales_channel || "admin_manual"),
    csvEscape(formatCents(inv.gravada_cents)),
    csvEscape(formatCents(inv.exonerada_cents)),
    csvEscape(formatCents(inv.inafecta_cents)),
    csvEscape(formatCents(inv.igv_cents)),
    csvEscape(formatCents(inv.total_cents)),
    csvEscape("PEN"),
    csvEscape(inv.payment_method || "—"),
    csvEscape(inv.sunat_hash || "—"),
    csvEscape(inv.notes || "—"),
  ]);

  const csv = buildCSV(headers, rows);
  const timestamp = new Date().toISOString().split("T")[0];
  downloadCSV(csv, `comprobantes_${timestamp}.csv`);
}

// ==========================================
// Export Clients (Clientes) to CSV
// ==========================================

export interface ClientExportRow {
  name: string;
  document_type: string;
  document_number: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  department_code: string;
  province_code: string;
  district_code: string;
  is_selva_zone: boolean;
  is_active: boolean;
  created_at: string;
}

export function exportClientsCSV(clients: ClientExportRow[]) {
  const headers = [
    "Razón Social / Nombre",
    "Tipo Documento",
    "N° Documento",
    "Teléfono",
    "Email",
    "Dirección",
    "Ciudad",
    "Código Departamento",
    "Código Provincia",
    "Código Distrito",
    "Zona Selva",
    "Activo",
    "Fecha Registro",
  ];

  const rows = clients.map((c) => [
    csvEscape(c.name),
    csvEscape(c.document_type),
    csvEscape(c.document_number),
    csvEscape(c.phone || "—"),
    csvEscape(c.email || "—"),
    csvEscape(c.address || "—"),
    csvEscape(c.city || "—"),
    csvEscape(c.department_code),
    csvEscape(c.province_code),
    csvEscape(c.district_code),
    csvEscape(c.is_selva_zone ? "Sí" : "No"),
    csvEscape(c.is_active ? "Sí" : "No"),
    csvEscape(formatDate(c.created_at)),
  ]);

  const csv = buildCSV(headers, rows);
  const timestamp = new Date().toISOString().split("T")[0];
  downloadCSV(csv, `clientes_${timestamp}.csv`);
}

// ==========================================
// Export Sales Report (Reporte de Ventas)
// ==========================================

export interface SalesReportRow {
  period: string;
  totalFacturas: number;
  totalBoletas: number;
  totalNotasCredito: number;
  totalNotasDebito: number;
  gravada: number;
  exonerada: number;
  inafecta: number;
  igv: number;
  total: number;
}

export function exportSalesReportCSV(
  reportRows: SalesReportRow[],
  dateFrom: string,
  dateTo: string
) {
  const headers = [
    "Periodo",
    "Facturas",
    "Boletas",
    "Notas Crédito",
    "Notas Débito",
    "Gravada (S/.)",
    "Exonerada (S/.)",
    "Inafecta (S/.)",
    "IGV (S/.)",
    "Total (S/.)",
  ];

  const rows = reportRows.map((r) => [
    csvEscape(r.period),
    csvEscape(r.totalFacturas),
    csvEscape(r.totalBoletas),
    csvEscape(r.totalNotasCredito),
    csvEscape(r.totalNotasDebito),
    csvEscape(formatCents(r.gravada)),
    csvEscape(formatCents(r.exonerada)),
    csvEscape(formatCents(r.inafecta)),
    csvEscape(formatCents(r.igv)),
    csvEscape(formatCents(r.total)),
  ]);

  const totalsRow = [
    csvEscape("TOTAL"),
    csvEscape(reportRows.reduce((s, r) => s + r.totalFacturas, 0)),
    csvEscape(reportRows.reduce((s, r) => s + r.totalBoletas, 0)),
    csvEscape(reportRows.reduce((s, r) => s + r.totalNotasCredito, 0)),
    csvEscape(reportRows.reduce((s, r) => s + r.totalNotasDebito, 0)),
    csvEscape(formatCents(reportRows.reduce((s, r) => s + r.gravada, 0))),
    csvEscape(formatCents(reportRows.reduce((s, r) => s + r.exonerada, 0))),
    csvEscape(formatCents(reportRows.reduce((s, r) => s + r.inafecta, 0))),
    csvEscape(formatCents(reportRows.reduce((s, r) => s + r.igv, 0))),
    csvEscape(formatCents(reportRows.reduce((s, r) => s + r.total, 0))),
  ];

  const csv = buildCSV(headers, [...rows, totalsRow]);
  downloadCSV(csv, `reporte_ventas_${dateFrom}_${dateTo}.csv`);
}
