import type { PdfContext } from "../types";
import { INVOICE_TYPES } from "../../constants";
import { loadPrintLogo } from "../load-image";
import { issueDate } from "../layout";

export async function drawHeader(ctx: PdfContext, y: number): Promise<number> {
  const { doc, invoice, sellerInfo, options, margin, contentWidth } = ctx;
  const right = margin + contentWidth;
  const leftWidth = contentWidth - 74;
  const start = y;
  doc.setTextColor(0);
  doc.setDrawColor(0);
  doc.setFont("helvetica", "bold");
  const logo = await loadPrintLogo(sellerInfo.logoUrl);
  if (logo) {
    const image = doc.getImageProperties(logo);
    const width = Math.min(66, 18 * image.width / image.height);
    const height = width * image.height / image.width;
    doc.addImage(logo, "PNG", margin, y, width, height);
    y += height + 7;
  } else {
    doc.setFontSize(17);
    const lines = doc.splitTextToSize(sellerInfo.nombreComercial || "KATSUMOTO", leftWidth);
    doc.text(lines, margin, y + 5);
    y += lines.length * 7 + 5;
  }
  const fiscalAddress = [sellerInfo.direccion, sellerInfo.distrito, sellerInfo.provincia, sellerInfo.departamento].filter(Boolean).join(", ");
  const details = [
    sellerInfo.razonSocial,
    fiscalAddress && `Domicilio fiscal: ${fiscalAddress}`,
    [sellerInfo.phone && `Tel. ${sellerInfo.phone}`, sellerInfo.email].filter(Boolean).join(" | "),
  ].filter(Boolean);
  doc.setFontSize(8);
  for (const detail of details) {
    const lines = doc.splitTextToSize(detail, leftWidth);
    doc.text(lines, margin, y, { lineHeightFactor: 1.45 });
    y += lines.length * 4.1 + 1;
  }
  const boxX = right - 66;
  doc.setFontSize(11);
  const title = doc.splitTextToSize((INVOICE_TYPES[invoice.invoice_type]?.label || invoice.invoice_type).toUpperCase(), 58);
  const boxHeight = 27 + title.length * 5;
  doc.setLineWidth(0.5);
  doc.rect(boxX, start, 66, boxHeight);
  doc.setFontSize(10);
  doc.text(`RUC ${sellerInfo.ruc}`, boxX + 33, start + 7, { align: "center" });
  doc.setFontSize(11);
  doc.text(title, boxX + 33, start + 15, { align: "center", lineHeightFactor: 1.3 });
  doc.setFontSize(14);
  doc.text(invoice.number, boxX + 33, start + boxHeight - 6, { align: "center" });
  y = Math.max(y, start + boxHeight + 5);
  doc.setLineWidth(0.5);
  doc.line(margin, y, right, y);
  y += 7;
  doc.setFontSize(9);
  doc.text(`EMISION  ${issueDate(invoice.issue_date)}`, margin, y);
  doc.text("MONEDA  SOLES (PEN)", right, y, { align: "right" });
  y += 6;
  if (options.branchName) {
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(`Sede: ${options.branchName}`, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 2;
  }
  if (sellerInfo.branchAddress) {
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(`Direccion de sede: ${sellerInfo.branchAddress}`, contentWidth);
    doc.text(lines, margin, y, { lineHeightFactor: 1.4 });
    y += lines.length * 4 + 2;
  }
  return y + 3;
}
