import jsPDF from "jspdf";
import { encodeEAN13, isValidEAN13 } from "@/lib/barcode";
import type { Product } from "@/lib/types";
import type { SellerInfo } from "../seller-info";

const MM_TO_PT = 2.83464567;

const LABEL_W_MM = 63;
const LABEL_H_MM = 33.9;
const MARGIN_X_MM = 8.5;
const MARGIN_Y_MM = 14;
const COLS = 3;
const ROWS = 8;

const LABEL_W_PT = LABEL_W_MM * MM_TO_PT;
const LABEL_H_PT = LABEL_H_MM * MM_TO_PT;
const MARGIN_X_PT = MARGIN_X_MM * MM_TO_PT;
const MARGIN_Y_PT = MARGIN_Y_MM * MM_TO_PT;


export interface LabelOptions {
  sellerInfo: SellerInfo;
  products: Product[];
  copies?: number;
  copiesByProduct?: Record<string, number>;
}

function drawEan13Barcode(
  doc: jsPDF,
  x: number,
  y: number,
  code: string,
  width: number,
  height: number
) {
  if (!code || code.length !== 13 || !isValidEAN13(code)) return;

  const binary = encodeEAN13(code);
  const modW = width / 95;

  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === "0") continue;
    const isGuard = i < 3 || (i >= 45 && i < 50) || i >= 92;
    const barH = isGuard ? height : height - 3;
    doc.setFillColor(0, 0, 0);
    doc.rect(x + i * modW, y, modW, barH, "F");
  }

  doc.setFontSize(5.5);
  doc.setFont("courier", "normal");
  doc.setTextColor(0, 0, 0);
  doc.setCharSpace(0);
  doc.text(code[0], x - 5, y + height + 3, { baseline: "top", align: "center" });
  for (let i = 0; i < 6; i++) {
    doc.text(code[i + 1], x + modW * (6.5 + i * 7), y + height + 3, { baseline: "top", align: "center" });
    doc.text(code[i + 7], x + modW * (53.5 + i * 7), y + height + 3, { baseline: "top", align: "center" });
  }
}

function drawSingleLabel(
  doc: jsPDF,
  product: Product,
  x: number,
  y: number,
  seller: SellerInfo
) {
  const PADDING = 2 * MM_TO_PT;
  const bx = x + PADDING;
  const by = y + PADDING;
  const bw = LABEL_W_PT - 2 * PADDING;

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.1);
  doc.rect(x, y, LABEL_W_PT, LABEL_H_PT);

  const businessName = seller.nombreComercial || seller.razonSocial || "";
  const barcodeY = by + 22;
  const barcodeH = 10 * MM_TO_PT;

  doc.setFontSize(5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(businessName.toUpperCase(), bx, by, { baseline: "top" });

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  const name = product.name.length > 28 ? product.name.slice(0, 27) + "\u2026" : product.name;
  doc.text(name, bx, by + 9, { baseline: "top" });

  drawEan13Barcode(doc, bx + 12, barcodeY, product.barcode, bw - 24, barcodeH);

  const infoY = barcodeY + barcodeH + 13;
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(`SKU: ${product.sku}`, bx, infoY, { baseline: "top" });

  doc.setFontSize(5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(product.unit, bx, infoY + 9, { baseline: "top" });
}

export function generateProductLabels(options: LabelOptions): jsPDF {
  const { sellerInfo, products, copies = 1, copiesByProduct = {} } = options;
  if (!products.length) throw new Error("Selecciona al menos un producto");
  const labels = products.flatMap(product => {
    if (!isValidEAN13(product.barcode)) throw new Error(`Revisar codigo de ${product.sku}`);
    const quantity = copiesByProduct[product.id] ?? copies;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("La cantidad debe estar entre 1 y 99");
    return Array.from({ length: quantity }, () => product);
  });
  if (labels.length > 5000) throw new Error("El limite es 5000 etiquetas por PDF");

  const doc = new jsPDF({ unit: "pt", format: "a4" });

  let labelIdx = 0;
  let pageCount = 0;
  let printed = 0;

  while (printed < labels.length) {
    if (pageCount > 0) doc.addPage();
    pageCount++;

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const product = labels[labelIdx];

        const lx = MARGIN_X_PT + col * LABEL_W_PT;
        const ly = MARGIN_Y_PT + row * LABEL_H_PT;

        drawSingleLabel(doc, product, lx, ly, sellerInfo);
        labelIdx++;
        printed++;

        if (printed >= labels.length) break;
      }
      if (printed >= labels.length) break;
    }
  }

  return doc;
}

export function downloadLabels(options: LabelOptions): void {
  const doc = generateProductLabels(options);
  const firstProduct = options.products[0];
  const name = options.products.length === 1
    ? `etiqueta-${firstProduct.sku}`
    : `etiquetas-${options.products.length}-productos`;
  doc.save(`${name}.pdf`);
}

export function printLabels(options: LabelOptions): void {
  const doc = generateProductLabels(options);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, "_blank");
  if (printWindow) {
    printWindow.onload = () => setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
