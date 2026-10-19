import type { PdfContext } from "../types";

export function drawCustomer(ctx: PdfContext, y: number): number {
  const { doc, invoice, margin, contentWidth } = ctx;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const name = doc.splitTextToSize(invoice.customer?.name || "Consumidor Final", contentWidth - 10);
  const height = 18 + name.length * 5;
  doc.setLineWidth(0.25);
  doc.rect(margin, y, contentWidth, height);
  doc.setFontSize(7.5);
  doc.text("CLIENTE / RAZON SOCIAL", margin + 5, y + 5);
  doc.setFontSize(10);
  doc.text(name, margin + 5, y + 11, { lineHeightFactor: 1.4 });
  doc.setFontSize(8.5);
  doc.text(`${invoice.customer?.document_type || "DOC"}: ${invoice.customer?.document_number || "-"}`, margin + 5, y + height - 4);
  return y + height + 7;
}
