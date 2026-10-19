import jsPDF from "jspdf";
import QRCode from "qrcode";
import type { Invoice } from "../../types";
import type { SellerInfo } from "../seller-info";
import type { PrintOptions } from "../types";
import { INVOICE_TYPES, IGV_RATE, PAYMENT_METHODS, TAX_AFFECTATION_TYPES } from "../../constants";
import { formatCents } from "../../format";
import { getLegalBasisText, determineTax } from "../../tax-engine";
import { INVOICE_TYPE_SUNAT_CODE, DOCUMENT_TYPE_SUNAT_CODE } from "../../types/sunat";
import { loadPrintLogo } from "../load-image";
import { issueDate } from "../layout";
import { centsToText } from "../amount-words";

type Block = { height: number; draw: (doc: jsPDF, y: number) => void };

export async function generateThermalTicket(
  invoice: Invoice,
  sellerInfo: SellerInfo,
  options: PrintOptions = {},
): Promise<jsPDF> {
  const width = options.format === "thermal-80mm" ? 80 : 58;
  const margin = width === 80 ? 4 : 3;
  const content = width - margin * 2;
  const bodySize = width === 80 ? 9 : 8;
  const measure = new jsPDF();
  measure.setFont("helvetica", "bold");
  const blocks: Block[] = [];
  const gap = (height = 2) => blocks.push({ height, draw: () => {} });
  const text = (value: string, size = bodySize, center = false) => {
    if (!value) return;
    measure.setFontSize(size);
    const lines: string[] = measure.splitTextToSize(value, content);
    const leading = size * 0.3528 * 1.4;
    for (const line of lines) {
      blocks.push({ height: leading, draw: (doc, y) => {
        doc.setFontSize(size);
        doc.text(line, center ? width / 2 : margin, y + size * 0.3528, { align: center ? "center" : "left" });
      } });
    }
  };
  const row = (label: string, value: string, size = bodySize) => {
    measure.setFontSize(size);
    const valueWidth = measure.getTextWidth(value);
    const labelWidth = content - valueWidth - 3;
    if (labelWidth < content * 0.35) {
      text(label, size);
      text(value, size);
      return;
    }
    const lines: string[] = measure.splitTextToSize(label, labelWidth);
    const leading = size * 0.3528 * 1.45;
    blocks.push({ height: lines.length * leading, draw: (doc, y) => {
      doc.setFontSize(size);
      doc.text(lines, margin, y + size * 0.3528, { lineHeightFactor: 1.45 });
      doc.text(value, width - margin, y + size * 0.3528, { align: "right" });
    } });
  };
  const rule = () => {
    gap(2);
    blocks.push({ height: 2, draw: (doc, y) => {
      doc.setLineWidth(0.3);
      doc.line(margin, y, width - margin, y);
    } });
  };

  const logo = await loadPrintLogo(sellerInfo.logoUrl);
  if (logo) {
    const props = measure.getImageProperties(logo);
    const logoWidth = Math.min(content - 6, 16 * props.width / props.height);
    const logoHeight = logoWidth * props.height / props.width;
    blocks.push({ height: logoHeight + 3, draw: (doc, y) => {
      doc.addImage(logo, "PNG", (width - logoWidth) / 2, y, logoWidth, logoHeight);
    } });
  } else {
    text(sellerInfo.nombreComercial || sellerInfo.razonSocial, 12, true);
    gap();
  }
  text(sellerInfo.razonSocial, bodySize, true);
  text(`RUC ${sellerInfo.ruc}`, bodySize, true);
  gap();
  const fiscalAddress = [sellerInfo.direccion, sellerInfo.distrito, sellerInfo.provincia, sellerInfo.departamento].filter(Boolean).join(", ");
  if (fiscalAddress) text(`Domicilio fiscal: ${fiscalAddress}`, 7, true);
  if (sellerInfo.phone) text(`Tel. ${sellerInfo.phone}`, 7, true);
  text(sellerInfo.email, 7, true);
  rule();
  const typeLabel = INVOICE_TYPES[invoice.invoice_type]?.label || invoice.invoice_type;
  text(typeLabel.toUpperCase(), 10, true);
  text(invoice.number, 12, true);
  gap();
  text(`Emision: ${issueDate(invoice.issue_date)}`, 8, true);
  if (options.branchName) text(`Sede: ${options.branchName}`, 7, true);
  if (sellerInfo.branchAddress) text(`Direccion de sede: ${sellerInfo.branchAddress}`, 7, true);
  rule();
  text("CLIENTE", 7);
  text(invoice.customer?.name || "Consumidor Final");
  text(`${invoice.customer?.document_type || "DOC"}: ${invoice.customer?.document_number || "-"}`, 8);
  rule();
  text("DETALLE DE PRODUCTOS", 7);
  gap();
  for (const [index, item] of (invoice.items || []).entries()) {
    text(`${index + 1}. ${item.product_name}`);
    if (item.product_sku) text(`SKU: ${item.product_sku}`, 7);
    row(`${item.quantity} x ${formatCents(item.unit_price_cents)}`, formatCents(item.line_total_cents));
    const tax = TAX_AFFECTATION_TYPES[item.tax_affectation || "gravado"];
    text(`${tax?.label || "Gravado"} | IGV: ${formatCents(item.igv_cents)}`, 7);
    if (item.discount_cents > 0 || item.discount_percent > 0) {
      text(`Descuento: ${formatCents(item.discount_cents)}${item.discount_percent > 0 ? ` (${item.discount_percent}%)` : ""}`, 7);
    }
    gap(3);
  }
  rule();
  if (invoice.gravada_cents > 0) row("Op. gravadas", formatCents(invoice.gravada_cents));
  if (invoice.exonerada_cents > 0) row("Op. exoneradas", formatCents(invoice.exonerada_cents));
  if (invoice.inafecta_cents > 0) row("Op. inafectas", formatCents(invoice.inafecta_cents));
  if (invoice.exportacion_cents > 0) row("Op. exportacion", formatCents(invoice.exportacion_cents));
  row(`IGV (${(IGV_RATE * 100).toFixed(0)}%)`, formatCents(invoice.igv_cents));
  rule();
  row("TOTAL", formatCents(invoice.total_cents), 12);
  gap();
  text("SOLES (PEN)", 7);
  text(`SON: ${centsToText(invoice.total_cents)}`, 7);
  rule();
  if (invoice.payment_method) text(`Pago: ${PAYMENT_METHODS[invoice.payment_method]?.label || invoice.payment_method}`);
  if (invoice.payment_method === "cash" && options.cashReceivedCents !== undefined) {
    row("Recibido", formatCents(options.cashReceivedCents));
    row("Vuelto", formatCents(Math.max(0, options.cashReceivedCents - invoice.total_cents)));
  }
  if (invoice.descripcion_motivo) { gap(); text(`Motivo: ${invoice.descripcion_motivo}`, 7); }
  if (invoice.notes) { gap(); text(`Observaciones: ${invoice.notes}`, 7); }
  if (options.taxConfig && invoice.exonerada_cents > 0) {
    const config = options.taxConfig;
    const legal = getLegalBasisText(determineTax({ ...config, productFamily: null }), config.sellerProvinceCode, config.sellerDistrictCode);
    if (legal) { rule(); text(legal, 7); }
  }
  rule();
  text(`Representacion impresa de ${typeLabel} ${invoice.number}`, 7, true);
  if (invoice.sunat_hash) {
    const qr = [
      sellerInfo.ruc, INVOICE_TYPE_SUNAT_CODE[invoice.invoice_type],
      invoice.serie, String(invoice.correlativo),
      (invoice.igv_cents / 100).toFixed(2), (invoice.total_cents / 100).toFixed(2),
      invoice.issue_date.slice(0, 10),
      DOCUMENT_TYPE_SUNAT_CODE[invoice.customer?.document_type || "DNI"] || "1",
      invoice.customer?.document_number || "00000000", invoice.sunat_hash,
    ].join("|");
    const qrImage = await QRCode.toDataURL(qr, { width: 400, margin: 4, color: { dark: "#000000", light: "#ffffff" } });
    gap();
    blocks.push({ height: 30, draw: (doc, y) => doc.addImage(qrImage, "PNG", (width - 28) / 2, y, 28, 28) });
    text(`Hash: ${invoice.sunat_hash}`, 7, true);
    text("Verifique en cpe.sunat.gob.pe", 7, true);
  } else {
    text("Comprobante pendiente de envio a SUNAT", 7, true);
  }
  if (sellerInfo.ticketFooter) { rule(); text(sellerInfo.ticketFooter, 7, true); }

  const pages: Block[][] = [[]];
  let height = margin * 2;
  for (const block of blocks) {
    if (height + block.height > 1000) {
      pages.push([]);
      height = margin * 2;
    }
    pages[pages.length - 1].push(block);
    height += block.height;
  }
  const pageHeight = (page: Block[]) => Math.max(80, margin * 2 + page.reduce((sum, block) => sum + block.height, 0));
  const doc = new jsPDF({ unit: "mm", format: [width, pageHeight(pages[0])], compress: true });
  pages.forEach((page, index) => {
    if (index) doc.addPage([width, pageHeight(page)], "portrait");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.setDrawColor(0);
    let y = margin;
    for (const block of page) {
      block.draw(doc, y);
      y += block.height;
    }
  });
  if ((options.action || "download") === "download") doc.save(`${invoice.number}-ticket.pdf`);
  if (options.action === "print") {
    const url = URL.createObjectURL(doc.output("blob"));
    const tab = window.open(url, "_blank");
    if (!tab) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return doc;
}
