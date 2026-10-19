import autoTable from "jspdf-autotable";
import type { PdfContext } from "../types";
import { formatCents } from "../../format";
import { TAX_AFFECTATION_TYPES } from "../../constants";
import { continuationHeader } from "../layout";

export function drawItemsTable(ctx: PdfContext, y: number): number {
  const { doc, invoice, margin, contentWidth } = ctx;
  const body = (invoice.items || []).map((item, index) => {
    const tax = TAX_AFFECTATION_TYPES[item.tax_affectation || "gravado"];
    const details = [item.product_sku && `SKU: ${item.product_sku}`, tax?.label,
      item.discount_cents > 0 && `Dscto: ${formatCents(item.discount_cents)}${item.discount_percent > 0 ? ` (${item.discount_percent}%)` : ""}`].filter(Boolean);
    return [String(index + 1), `${item.product_name}\n${details.join(" | ")}`, String(item.quantity),
      formatCents(item.unit_price_cents), formatCents(item.igv_cents), formatCents(item.line_total_cents)];
  });
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, top: 34, bottom: 23 },
    tableWidth: contentWidth,
    head: [["#", "Descripcion", "Cant.", "P. unitario", "IGV", "Importe"]],
    body,
    theme: "plain",
    rowPageBreak: "avoid",
    styles: { font: "helvetica", fontStyle: "bold", fontSize: 8.5, textColor: 0, cellPadding: { top: 3.5, bottom: 3.5, left: 2, right: 2 }, overflow: "linebreak", valign: "top" },
    headStyles: { fontSize: 8, fillColor: 255, lineColor: 0, lineWidth: { top: 0.4, bottom: 0.4 } },
    bodyStyles: { lineColor: 0, lineWidth: { bottom: 0.15 } },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: contentWidth - 93 },
      2: { cellWidth: 13, halign: "right" },
      3: { cellWidth: 25, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 25, halign: "right" },
    },
    willDrawPage: (data) => { if (data.pageNumber > 1) continuationHeader(ctx); },
  });
  return (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
}
