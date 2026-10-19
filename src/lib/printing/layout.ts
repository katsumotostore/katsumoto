import type { PdfContext } from "./types";

export function continuationHeader(ctx: PdfContext): number {
  const { doc, margin, contentWidth, invoice, sellerInfo } = ctx;
  doc.setTextColor(0);
  doc.setDrawColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const name = doc.splitTextToSize(sellerInfo.nombreComercial || sellerInfo.razonSocial, contentWidth - 65);
  doc.text(name, margin, 16);
  doc.text(invoice.number, margin + contentWidth, 16, { align: "right" });
  const bottom = 18 + name.length * 4;
  doc.setLineWidth(0.3);
  doc.line(margin, bottom, margin + contentWidth, bottom);
  return bottom + 7;
}

export function ensureSpace(ctx: PdfContext, y: number, height: number): number {
  if (y + height <= ctx.doc.internal.pageSize.getHeight() - 22) return y;
  ctx.doc.addPage();
  return continuationHeader(ctx);
}

export function flowText(ctx: PdfContext, text: string, y: number, size = 8): number {
  const { doc, margin, contentWidth } = ctx;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  const lines: string[] = doc.splitTextToSize(text, contentWidth);
  const leading = size * 0.3528 * 1.5;
  for (const line of lines) {
    y = ensureSpace(ctx, y, leading);
    doc.setFontSize(size);
    doc.text(line, margin, y);
    y += leading;
  }
  return y + 3;
}

export function issueDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}
