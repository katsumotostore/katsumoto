import QRCode from "qrcode";
import type { PdfContext } from "../types";
import { INVOICE_TYPE_SUNAT_CODE, DOCUMENT_TYPE_SUNAT_CODE } from "../../types/sunat";
import { INVOICE_TYPES } from "../../constants";

const QR_SIZE_MM = 28;

export async function drawQrHash(ctx: PdfContext, y: number): Promise<number> {
  const { doc, invoice, sellerInfo, pageWidth, margin } = ctx;
  const rightX = pageWidth - margin;

  const hasHash = !!invoice.sunat_hash;
  const typeCode = INVOICE_TYPE_SUNAT_CODE[invoice.invoice_type] || "01";
  const typeLabel = INVOICE_TYPES[invoice.invoice_type]?.label || invoice.invoice_type.toUpperCase();
  const docTypeCode = DOCUMENT_TYPE_SUNAT_CODE[invoice.customer?.document_type || "DNI"] || "1";
  const docNumber = invoice.customer?.document_number || "00000000";

  const qrData = [
    sellerInfo.ruc, typeCode,
    invoice.serie || invoice.number.split("-")[0] || "",
    String(invoice.correlativo || invoice.number.split("-")[1] || ""),
    (invoice.igv_cents / 100).toFixed(2), (invoice.total_cents / 100).toFixed(2),
    invoice.issue_date || new Date().toISOString().split("T")[0],
    docTypeCode, docNumber,
    invoice.sunat_hash || "",
  ].join("|");

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(margin, y, rightX, y);
  y += 5;

  let qrBase64: string | null = null;
  try {
    qrBase64 = await QRCode.toDataURL(qrData, {
      width: 400, margin: 4,
      color: { dark: "#000000", light: "#ffffff" },
    });
  } catch { /* skip */ }

  const textStartY = y;
  const textW = rightX - margin - (qrBase64 ? QR_SIZE_MM + 4 : 0);

  doc.setFontSize(6.5);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("Representación Impresa de:", margin, y);
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(7);
  doc.text(`${typeLabel} ${invoice.number}`, margin, y);
  y += 4;

  if (hasHash) {
    doc.setFontSize(6.5);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    const hashLines = doc.splitTextToSize(`Hash: ${invoice.sunat_hash}`, textW);
    doc.text(hashLines, margin, y);
    y += hashLines.length * 3.5 + 2;
  }

  if (!hasHash) {
    doc.setFontSize(6);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text("Comprobante pendiente de envío a SUNAT", margin, y);
    y += 4;
  }

  if (qrBase64) {
    doc.addImage(qrBase64, "PNG", rightX - QR_SIZE_MM, textStartY, QR_SIZE_MM, QR_SIZE_MM);
  }

  return Math.max(y, textStartY + QR_SIZE_MM) + 2;
}
