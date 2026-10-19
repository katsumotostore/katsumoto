import type { PdfContext } from "../types";
import { formatCents } from "../../format";
import { IGV_RATE, PAYMENT_METHODS } from "../../constants";
import { getNetBaseAmount } from "../../calculations";
import { centsToText } from "../amount-words";

export function drawTotals(ctx: PdfContext, y: number): number {
  const { doc, invoice, pageWidth, margin } = ctx;

  const col1X = pageWidth - margin - 80;
  const col2X = pageWidth - margin;
  const lineH = 5.5;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("DESGLOSE TRIBUTARIO", margin, y);
  doc.setFontSize(8);
  const amountLines = doc.splitTextToSize(`SON: ${centsToText(invoice.total_cents)}`, col1X - margin - 10);
  doc.text(amountLines, margin, y + 7, { lineHeightFactor: 1.5 });
  if (invoice.payment_method === "cash" && ctx.options.cashReceivedCents !== undefined) {
    const cashY = y + 12 + amountLines.length * 4.3;
    doc.text(`Recibido: ${formatCents(ctx.options.cashReceivedCents)}`, margin, cashY);
    doc.text(`Vuelto: ${formatCents(Math.max(0, ctx.options.cashReceivedCents - invoice.total_cents))}`, margin, cashY + 5);
  }
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);

  doc.setTextColor(0, 0, 0);
  doc.text("Subtotal", col1X, y);
  doc.setTextColor(0, 0, 0);
  doc.text(formatCents(getNetBaseAmount(invoice)), col2X, y, { align: "right" });
  y += lineH;

  if (invoice.gravada_cents > 0) {
    doc.setTextColor(0, 0, 0);
    doc.text("Op. Gravadas (Cód. 10)", col1X, y);
    doc.setTextColor(0, 0, 0);
    doc.text(formatCents(invoice.gravada_cents), col2X, y, { align: "right" });
    y += lineH;
  }

  if (invoice.exonerada_cents > 0) {
    doc.setTextColor(0, 0, 0);
    doc.text("Op. Exoneradas (Cód. 20)", col1X, y);
    doc.setTextColor(0, 0, 0);
    doc.text(formatCents(invoice.exonerada_cents), col2X, y, { align: "right" });
    y += lineH;
  }

  if (invoice.inafecta_cents > 0) {
    doc.setTextColor(0, 0, 0);
    doc.text("Op. Inafectas (Cód. 30)", col1X, y);
    doc.setTextColor(0, 0, 0);
    doc.text(formatCents(invoice.inafecta_cents), col2X, y, { align: "right" });
    y += lineH;
  }

  if (invoice.exportacion_cents > 0) {
    doc.setTextColor(0, 0, 0);
    doc.text("Op. Exportación (Cód. 40)", col1X, y);
    doc.setTextColor(0, 0, 0);
    doc.text(formatCents(invoice.exportacion_cents), col2X, y, { align: "right" });
    y += lineH;
  }

  doc.setTextColor(0, 0, 0);
  doc.text(`IGV (${(IGV_RATE * 100).toFixed(0)}%)`, col1X, y);
  doc.setTextColor(0, 0, 0);
  doc.text(formatCents(invoice.igv_cents), col2X, y, { align: "right" });
  y += 3;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.line(col1X, y, col2X, y);
  y += 5;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("TOTAL", col1X, y);
  doc.text(formatCents(invoice.total_cents), col2X, y, { align: "right" });
  y += 10;

  if (invoice.payment_method) {
    const methodLabel = PAYMENT_METHODS[invoice.payment_method]?.label || invoice.payment_method;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Método de Pago", col1X, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(methodLabel, col2X, y, { align: "right" });
    y += 4;
  }

  return y + 4;
}
