// ============================================================
// Thermal Receipt Builder — SUNAT-compliant receipt generation
// Produces both plain text and ESC/POS binary output
// ============================================================

import { EscposBuilder } from "./escpos-commands";
import type { Invoice, InvoiceItem } from "../../types/invoice";
import type { SellerInfo } from "../seller-info";
import type { PdfTaxConfig } from "../types";
import { INVOICE_TYPES, PAYMENT_METHODS } from "../../constants/invoices";
import { IGV_RATE } from "../../constants/tax";
import { INVOICE_TYPE_SUNAT_CODE, DOCUMENT_TYPE_SUNAT_CODE } from "../../types/sunat";
import { formatCents } from "../../format";

// ============================================================
// Types
// ============================================================

export type PaperWidth = 80 | 58;

export interface ReceiptOptions {
  paperWidth: PaperWidth;
  branchName?: string;
  taxConfig?: PdfTaxConfig;
  cashReceivedCents?: number;
  isReprint?: boolean;
  copies?: number;
  autoCut?: boolean;
  openDrawer?: boolean;
}

export interface ReceiptResult {
  text: string;
  escpos: Uint8Array;
}

// ============================================================
// Layout constants
// ============================================================

const CHARS_PER_LINE: Record<PaperWidth, number> = {
  58: 32,
  80: 48,
};

const SUNAT_VERIFY_URL = "https://cpe.sunat.gob.pe";

// ============================================================
// Number to words (Spanish, PEN)
// ============================================================

const UNITS = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const TEENS = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const TENS = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const HUNDREDS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function numberToWords(n: number): string {
  if (n === 0) return "CERO";
  if (n === 100) return "CIEN";

  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 30) return n === 20 ? "VEINTE" : "VEINTI" + UNITS[n - 20];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    const unit = n % 10;
    return unit ? `${tens} Y ${UNITS[unit]}` : tens;
  }
  if (n < 1000) {
    const hundred = HUNDREDS[Math.floor(n / 100)];
    const rest = n % 100;
    return rest ? `${hundred} ${numberToWords(rest)}` : hundred;
  }
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    const thousandsWord = thousands === 1 ? "MIL" : `${numberToWords(thousands)} MIL`;
    return rest ? `${thousandsWord} ${numberToWords(rest)}` : thousandsWord;
  }
  if (n < 1_000_000_000) {
    const millions = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const millionsWord = millions === 1 ? "UN MILLON" : `${numberToWords(millions)} MILLONES`;
    return rest ? `${millionsWord} ${numberToWords(rest)}` : millionsWord;
  }
  return String(n);
}

function centsToText(cents: number): string {
  const isNegative = cents < 0;
  const soles = Math.floor(Math.abs(cents) / 100);
  const centimos = Math.abs(cents) % 100;
  const solesText = numberToWords(soles);
  const centimosText = centimos > 0 ? `CON ${numberToWords(centimos)}/100` : "CON 00/100";
  const prefix = isNegative ? "MENOS " : "";
  return `${prefix}${solesText} SOLES ${centimosText}`;
}

// ============================================================
// Text formatting helpers
// ============================================================

function centerLine(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width);
  const padding = width - text.length;
  const leftPad = Math.floor(padding / 2);
  return " ".repeat(leftPad) + text + " ".repeat(padding - leftPad);
}

function rightPad(text: string, width: number): string {
  return text.length >= width ? text.substring(0, width) : text + " ".repeat(width - text.length);
}

function leftPad(text: string, width: number): string {
  return text.length >= width ? text.substring(text.length - width) : " ".repeat(width - text.length) + text;
}

function twoColumnLine(left: string, right: string, width: number): string {
  const maxLeft = width - right.length - 1;
  const leftPart = left.length > maxLeft ? left.substring(0, maxLeft) : rightPad(left, maxLeft);
  return leftPart + " " + leftPad(right, right.length);
}

function wrapText(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > width) {
      if (current) lines.push(current);
      if (word.length > width) {
        for (let i = 0; i < word.length; i += width) {
          lines.push(word.substring(i, i + width));
        }
        current = "";
      } else {
        current = word;
      }
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function separator(char: string, width: number): string {
  return char.repeat(width);
}

function formatCentsShort(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ============================================================
// QR data — SUNAT pipe format
// ============================================================

function buildQrData(invoice: Invoice, sellerInfo: SellerInfo): string {
  const typeCode = INVOICE_TYPE_SUNAT_CODE[invoice.invoice_type] || "01";
  const docTypeCode = DOCUMENT_TYPE_SUNAT_CODE[invoice.customer?.document_type || "DNI"] || "1";
  const docNumber = invoice.customer?.document_number || "00000000";
  const serie = invoice.serie || invoice.number.split("-")[0] || "";
  const correlativo = String(invoice.correlativo || invoice.number.split("-")[1] || "");

  return [
    sellerInfo.ruc,
    typeCode,
    serie,
    correlativo,
    formatCentsShort(invoice.igv_cents),
    formatCentsShort(invoice.total_cents),
    invoice.issue_date || new Date().toISOString().split("T")[0],
    docTypeCode,
    docNumber,
    invoice.sunat_hash || "",
  ].join("|");
}

// ============================================================
// Document type labels
// ============================================================

function getDocumentTypeLabel(invoiceType: string): string {
  const labels: Record<string, string> = {
    factura: "FACTURA ELECTRONICA",
    boleta: "BOLETA DE VENTA ELECTRONICA",
    nota_credito: "NOTA DE CREDITO ELECTRONICA",
    nota_debito: "NOTA DE DEBITO ELECTRONICA",
  };
  return labels[invoiceType] || invoiceType.toUpperCase();
}

function getShortDocumentTypeLabel(invoiceType: string): string {
  const labels: Record<string, string> = {
    factura: "Factura Electronica",
    boleta: "Boleta de Venta Electronica",
    nota_credito: "Nota de Credito Electronica",
    nota_debito: "Nota de Debito Electronica",
  };
  return labels[invoiceType] || invoiceType;
}

// ============================================================
// Build plain text receipt (for preview / testing)
// ============================================================

export function buildTextReceipt(
  invoice: Invoice,
  sellerInfo: SellerInfo,
  options: ReceiptOptions,
): string {
  const w = CHARS_PER_LINE[options.paperWidth];
  const lines: string[] = [];
  const sep = () => lines.push(separator("-", w));
  const dsep = () => lines.push(separator("=", w));

  if (options.isReprint) {
    lines.push(centerLine("*** REIMPRESION ***", w));
    lines.push("");
  }

  // Header: Company
  dsep();
  lines.push(centerLine(sellerInfo.razonSocial || sellerInfo.nombreComercial, w));
  if (sellerInfo.nombreComercial && sellerInfo.razonSocial !== sellerInfo.nombreComercial) {
    lines.push(centerLine(sellerInfo.nombreComercial, w));
  }
  lines.push(centerLine(`RUC: ${sellerInfo.ruc}`, w));

  const addrParts = [sellerInfo.direccion, sellerInfo.distrito, sellerInfo.provincia, sellerInfo.departamento].filter(Boolean);
  for (const part of wrapText(addrParts.length ? `Domicilio fiscal: ${addrParts.join(", ")}` : "", w)) {
    lines.push(centerLine(part, w));
  }
  if (sellerInfo.phone) {
    lines.push(centerLine(`Tel: ${sellerInfo.phone}`, w));
  }
  if (sellerInfo.email) {
    lines.push(centerLine(`Email: ${sellerInfo.email}`, w));
  }
  dsep();

  // Document type + number
  lines.push(centerLine(getDocumentTypeLabel(invoice.invoice_type), w));
  lines.push(centerLine(invoice.number, w));

  if (options.branchName) {
    lines.push(centerLine(`Sede: ${options.branchName}`, w));
  }
  if (sellerInfo.branchAddress) {
    for (const part of wrapText(`Direccion de sede: ${sellerInfo.branchAddress}`, w)) {
      lines.push(centerLine(part, w));
    }
  }

  sep();

  // Date/time
  const issueDate = new Date(invoice.issue_date);
  const dateStr = issueDate.toLocaleDateString("es-PE");
  const timeStr = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  lines.push(`Fecha: ${dateStr}  Hora: ${timeStr}`);

  sep();

  // Customer
  lines.push("CLIENTE:");
  const customerName = invoice.customer?.name || "Consumidor Final";
  const docLabel = invoice.customer?.document_type || "DOC";
  const docNumber = invoice.customer?.document_number || "00000000";
  lines.push(customerName);
  lines.push(`${docLabel}: ${docNumber}`);

  sep();

  // Items header
  lines.push(twoColumnLine("CANT DESCRIPCION", "IMPORTE", w));
  sep();

  // Items
  const items = invoice.items || [];
  for (const item of items) {
    const qtyStr = `${item.quantity}`;
    const priceStr = formatCentsShort(item.line_total_cents);
    const nameLines = wrapText(item.product_name, w - priceStr.length - 3);

    for (let i = 0; i < nameLines.length; i++) {
      if (i === 0) {
        const qtyPart = `${rightPad(qtyStr, 3)} `;
        const namePart = rightPad(nameLines[i], w - priceStr.length - 4);
        lines.push(qtyPart + namePart + " " + leftPad(priceStr, priceStr.length));
      } else {
        lines.push("    " + rightPad(nameLines[i], w - 1));
      }
    }

    if (item.discount_percent > 0) {
      const discountNote = `    Dcto ${item.discount_percent}%: -${formatCentsShort(item.discount_cents)}`;
      lines.push(discountNote.length > w ? discountNote.substring(0, w) : discountNote);
    }
  }

  sep();

  // Tax breakdown
  lines.push(twoColumnLine("Op. Gravadas:", formatCentsShort(invoice.gravada_cents), w));

  if (invoice.exonerada_cents > 0) {
    lines.push(twoColumnLine("Op. Exoneradas:", formatCentsShort(invoice.exonerada_cents), w));
  }
  if (invoice.inafecta_cents > 0) {
    lines.push(twoColumnLine("Op. Inafectas:", formatCentsShort(invoice.inafecta_cents), w));
  }
  if (invoice.exportacion_cents > 0) {
    lines.push(twoColumnLine("Op. Exportacion:", formatCentsShort(invoice.exportacion_cents), w));
  }

  lines.push(twoColumnLine(`IGV (${(IGV_RATE * 100).toFixed(0)}%):`, formatCentsShort(invoice.igv_cents), w));
  lines.push(twoColumnLine("Moneda:", "SOLES (PEN)", w));

  dsep();

  // Total
  lines.push(twoColumnLine("TOTAL:", formatCentsShort(invoice.total_cents), w));
  lines.push(twoColumnLine("", `S/ ${formatCentsShort(invoice.total_cents)}`, w));

  dsep();

  // Amount in words
  const amountText = centsToText(invoice.total_cents);
  for (const l of wrapText(`SON: ${amountText}`, w)) {
    lines.push(l);
  }

  // Payment method
  if (invoice.payment_method) {
    const methodLabel = PAYMENT_METHODS[invoice.payment_method]?.label || invoice.payment_method;
    lines.push("");
    lines.push(`Pago: ${methodLabel}`);
  }

  // Cash change
  if (options.cashReceivedCents !== undefined && invoice.payment_method === "cash") {
    lines.push(twoColumnLine("Recibido:", formatCentsShort(options.cashReceivedCents), w));
    const change = options.cashReceivedCents - invoice.total_cents;
    if (change > 0) {
      lines.push(twoColumnLine("Vuelto:", formatCentsShort(change), w));
    }
  }

  sep();

  // SUNAT representation section
  if (invoice.sunat_hash) {
    lines.push("");
    lines.push(centerLine("Representacion impresa de la", w));
    lines.push(centerLine(getShortDocumentTypeLabel(invoice.invoice_type), w));
    lines.push(centerLine(invoice.number, w));
    lines.push("");

    for (const l of wrapText(`Hash: ${invoice.sunat_hash}`, w)) {
      lines.push(l);
    }

    lines.push("");
    lines.push(centerLine("[CODIGO QR SUNAT]", w));
    lines.push("");

    lines.push(centerLine("Verifique su comprobante en:", w));
    lines.push(centerLine(SUNAT_VERIFY_URL, w));
  } else {
    lines.push("");
    lines.push(centerLine("Comprobante pendiente de envio", w));
    lines.push(centerLine("a SUNAT", w));
  }

  // Selva law legal text
  if (options.taxConfig && invoice.exonerada_cents > 0) {
    lines.push("");
    sep();
    const legalText = "Exonerado del IGV conforme al Art. 12 de la Ley N. 27037 y D.S. 059-2023-EF. Vigencia hasta el 31/12/2028.";
    for (const l of wrapText(legalText, w)) {
      lines.push(l);
    }
  }

  // Notes
  if (invoice.notes) {
    lines.push("");
    for (const l of wrapText(`Obs: ${invoice.notes}`, w)) {
      lines.push(l);
    }
  }

  // Credit note reference
  if (invoice.reference_invoice_id && invoice.motivo_nota) {
    lines.push("");
    lines.push(`Ref: ${invoice.motivo_nota}`);
    if (invoice.descripcion_motivo) {
      for (const l of wrapText(invoice.descripcion_motivo, w)) {
        lines.push(l);
      }
    }
  }

  // Configurable footer (guarantee policy, social media, etc.)
  if (sellerInfo.ticketFooter) {
    lines.push("");
    sep();
    for (const l of wrapText(sellerInfo.ticketFooter, w)) {
      lines.push(l);
    }
  }

  // Footer
  lines.push("");
  lines.push(centerLine(`Generado por Katsumoto POS`, w));
  lines.push(centerLine(new Date().toLocaleString("es-PE"), w));
  lines.push("");

  return lines.join("\n");
}

// ============================================================
// Build ESC/POS binary receipt
// ============================================================

export function buildEscposReceipt(
  invoice: Invoice,
  sellerInfo: SellerInfo,
  options: ReceiptOptions,
): Uint8Array {
  const builder = new EscposBuilder();
  const w = CHARS_PER_LINE[options.paperWidth];
  const copies = options.copies || 1;

  for (let copy = 0; copy < copies; copy++) {
    if (copy > 0) {
      builder.feed(3);
    }

    builder.init().codePage(850).resetLineSpacing();

    if (options.isReprint) {
      builder
        .align("center")
        .bold(true)
        .line("*** REIMPRESION ***")
        .bold(true)
        .newline();
    }

    // Header
    builder.align("center").bold(true);
    builder.line(sellerInfo.razonSocial || sellerInfo.nombreComercial);

    if (sellerInfo.nombreComercial && sellerInfo.razonSocial !== sellerInfo.nombreComercial) {
      builder.bold(true).line(sellerInfo.nombreComercial).bold(true);
    }

    builder.bold(true).line(`RUC: ${sellerInfo.ruc}`);

    const addrParts = [sellerInfo.direccion, sellerInfo.distrito, sellerInfo.provincia, sellerInfo.departamento].filter(Boolean);
    for (const part of wrapText(addrParts.length ? `Domicilio fiscal: ${addrParts.join(", ")}` : "", w)) {
      builder.line(part);
    }

    if (sellerInfo.phone) {
      builder.line(`Tel: ${sellerInfo.phone}`);
    }
    if (sellerInfo.email) {
      builder.line(`Email: ${sellerInfo.email}`);
    }

    builder.line(separator("=", w));

    // Document type + number
    builder
      .doubleSize(true)
      .bold(true)
      .line(getDocumentTypeLabel(invoice.invoice_type))
      .doubleSize(false)
      .bold(true)
      .line(invoice.number)
      .bold(true);

    if (options.branchName) {
      builder.line(`Sede: ${options.branchName}`);
    }
    if (sellerInfo.branchAddress) {
      for (const part of wrapText(`Direccion de sede: ${sellerInfo.branchAddress}`, w)) {
        builder.line(part);
      }
    }

    builder.line(separator("-", w));

    // Date/time
    const issueDate = new Date(invoice.issue_date);
    const dateStr = issueDate.toLocaleDateString("es-PE");
    const timeStr = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    builder
      .align("left")
      .line(`Fecha: ${dateStr}  Hora: ${timeStr}`);

    builder.line(separator("-", w));

    // Customer
    builder.bold(true).line("CLIENTE:").bold(true);
    builder.line(invoice.customer?.name || "Consumidor Final");
    const docLabel = invoice.customer?.document_type || "DOC";
    const docNumber = invoice.customer?.document_number || "00000000";
    builder.line(`${docLabel}: ${docNumber}`);

    builder.line(separator("-", w));

    // Items
    const items = invoice.items || [];
    for (const item of items) {
      const priceStr = formatCentsShort(item.line_total_cents);
      const nameLines = wrapText(item.product_name, w - priceStr.length - 3);
      const qtyStr = `${item.quantity}`;

      for (let i = 0; i < nameLines.length; i++) {
        if (i === 0) {
          builder.line(twoColumnLine(`${rightPad(qtyStr, 3)} ${nameLines[i]}`, priceStr, w));
        } else {
          builder.line(`    ${nameLines[i]}`);
        }
      }

      if (item.discount_percent > 0) {
        const discountNote = `    Dcto ${item.discount_percent}%: -${formatCentsShort(item.discount_cents)}`;
        builder.line(discountNote.length > w ? discountNote.substring(0, w) : discountNote);
      }
    }

    builder.line(separator("-", w));

    // Tax breakdown
    builder.line(twoColumnLine("Op. Gravadas:", formatCentsShort(invoice.gravada_cents), w));

    if (invoice.exonerada_cents > 0) {
      builder.line(twoColumnLine("Op. Exoneradas:", formatCentsShort(invoice.exonerada_cents), w));
    }
    if (invoice.inafecta_cents > 0) {
      builder.line(twoColumnLine("Op. Inafectas:", formatCentsShort(invoice.inafecta_cents), w));
    }
    if (invoice.exportacion_cents > 0) {
      builder.line(twoColumnLine("Op. Exportacion:", formatCentsShort(invoice.exportacion_cents), w));
    }

    builder.line(twoColumnLine(`IGV (${(IGV_RATE * 100).toFixed(0)}%):`, formatCentsShort(invoice.igv_cents), w));
    builder.line(twoColumnLine("Moneda:", "SOLES (PEN)", w));

    builder.line(separator("=", w));

    // Total
    builder
      .doubleSize(true)
      .bold(true)
      .line(twoColumnLine("TOTAL:", `S/ ${formatCentsShort(invoice.total_cents)}`, w))
      .doubleSize(false)
      .bold(true);

    builder.line(separator("=", w));

    // Amount in words
    const amountText = centsToText(invoice.total_cents);
    for (const l of wrapText(`SON: ${amountText}`, w)) {
      builder.line(l);
    }

    // Payment method
    if (invoice.payment_method) {
      const methodLabel = PAYMENT_METHODS[invoice.payment_method]?.label || invoice.payment_method;
      builder.newline().line(`Pago: ${methodLabel}`);
    }

    // Cash change
    if (options.cashReceivedCents !== undefined && invoice.payment_method === "cash") {
      builder.line(twoColumnLine("Recibido:", formatCentsShort(options.cashReceivedCents), w));
      const change = options.cashReceivedCents - invoice.total_cents;
      if (change > 0) {
        builder.line(twoColumnLine("Vuelto:", formatCentsShort(change), w));
      }
    }

    builder.line(separator("-", w));

    // SUNAT section
    if (invoice.sunat_hash) {
      builder.newline().align("center");
      builder.line("Representacion impresa de la");
      builder.line(getShortDocumentTypeLabel(invoice.invoice_type));
      builder.line(invoice.number);
      builder.newline();

      builder.align("left");
      for (const l of wrapText(`Hash: ${invoice.sunat_hash}`, w)) {
        builder.line(l);
      }
      builder.newline();

      // QR Code native ESC/POS
      const qrData = buildQrData(invoice, sellerInfo);
      const qrSize = options.paperWidth === 80 ? 6 : 4;
      builder.align("center").newline();
      builder.qrCode(qrData, qrSize, "M");

      builder.newline().newline();
      builder.line("Verifique su comprobante en:");
      builder.line(SUNAT_VERIFY_URL);
    } else {
      builder.newline().align("center");
      builder.line("Comprobante pendiente de envio a SUNAT");
    }

    // Selva law
    if (options.taxConfig && invoice.exonerada_cents > 0) {
      builder.newline().line(separator("-", w));
      const legalText = "Exonerado del IGV conforme al Art. 12 de la Ley N. 27037 y D.S. 059-2023-EF. Vigencia hasta el 31/12/2028.";
      for (const l of wrapText(legalText, w)) {
        builder.line(l);
      }
    }

    // Notes
    if (invoice.notes) {
      builder.newline().align("left");
      for (const l of wrapText(`Obs: ${invoice.notes}`, w)) {
        builder.line(l);
      }
    }

    // Credit note reference
    if (invoice.reference_invoice_id && invoice.motivo_nota) {
      builder.newline().line(`Ref: ${invoice.motivo_nota}`);
      if (invoice.descripcion_motivo) {
        for (const l of wrapText(invoice.descripcion_motivo, w)) {
          builder.line(l);
        }
      }
    }

    // Configurable footer (guarantee policy, social media, etc.)
    if (sellerInfo.ticketFooter) {
      builder.newline().line(separator("-", w));
      for (const l of wrapText(sellerInfo.ticketFooter, w)) {
        builder.line(l);
      }
    }

    // Footer
    builder
      .newline()
      .align("center")
      .line("Generado por Katsumoto POS")
      .line(new Date().toLocaleString("es-PE"))
      .newline();
  }

  // Feed + Cut
  builder.feed(3);
  if (options.autoCut !== false) {
    builder.cut("partial");
  }

  // Cash drawer
  if (options.openDrawer) {
    builder.openCashDrawer();
  }

  return builder.toBytes();
}

// ============================================================
// Convenience: build both text + escpos
// ============================================================

export function buildReceipt(
  invoice: Invoice,
  sellerInfo: SellerInfo,
  options: ReceiptOptions = { paperWidth: 80 },
): ReceiptResult {
  return {
    text: buildTextReceipt(invoice, sellerInfo, options),
    escpos: buildEscposReceipt(invoice, sellerInfo, options),
  };
}

// ============================================================
// Test receipt (for printer setup / diagnostics)
// ============================================================

export function buildTestReceipt(paperWidth: PaperWidth = 80): ReceiptResult {
  const w = CHARS_PER_LINE[paperWidth];
  const lines: string[] = [];
  const sep = () => lines.push(separator("-", w));

  lines.push(centerLine("=== TEST DE IMPRESION ===", w));
  lines.push("");
  lines.push(`Ancho: ${paperWidth}mm (${w} chars)`);
  lines.push(`Fecha: ${new Date().toLocaleString("es-PE")}`);
  lines.push("");
  sep();
  lines.push("Texto normal");
  lines.push(centerLine("Texto centrado", w));
  lines.push(twoColumnLine("Izquierda:", "Derecha", w));
  lines.push(twoColumnLine("Total:", "S/ 1,234.56", w));
  lines.push("");
  sep();
  lines.push("Caracteres especiales:");
  lines.push("N#$%&/@");
  lines.push("");
  sep();
  lines.push(centerLine("Si puede leer esto,", w));
  lines.push(centerLine("la impresora funciona OK", w));
  lines.push(centerLine("========================", w));
  lines.push("");
  lines.push(centerLine("[QR TEST]", w));

  // ESC/POS version
  const builder = new EscposBuilder();
  builder
    .init()
    .codePage(850)
    .resetLineSpacing()
    .align("center")
    .doubleSize(true)
    .bold(true)
    .line("TEST DE IMPRESION")
    .doubleSize(false)
    .bold(true)
    .newline()
    .line(`Ancho: ${paperWidth}mm (${w} chars)`)
    .line(`Fecha: ${new Date().toLocaleString("es-PE")}`)
    .newline()
    .align("left")
    .line(separator("-", w))
    .line("Texto normal")
    .align("center").line("Texto centrado")
    .align("left")
    .line(twoColumnLine("Izquierda:", "Derecha", w))
    .line(twoColumnLine("Total:", "S/ 1,234.56", w))
    .newline()
    .line(separator("-", w))
    .line("Caracteres especiales:")
    .line("N#$%&/@")
    .newline()
    .line(separator("-", w))
    .align("center")
    .line("Si puede leer esto,")
    .line("la impresora funciona OK")
    .newline()
    .qrCode("TEST-KATSUMOTO-POS", paperWidth === 80 ? 6 : 4, "M")
    .newline()
    .feed(3)
    .cut("partial");

  return {
    text: lines.join("\n"),
    escpos: builder.toBytes(),
  };
}
