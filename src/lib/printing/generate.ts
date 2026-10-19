import jsPDF from "jspdf";
import type { Invoice } from "../types";
import type { SellerInfo } from "./seller-info";
import type { PrintOptions, PdfContext } from "./types";
import { drawHeader } from "./components/pdf-header";
import { drawCustomer } from "./components/pdf-customer";
import { drawItemsTable } from "./components/pdf-items-table";
import { drawTotals } from "./components/pdf-totals";
import { drawQrHash } from "./components/pdf-qr-hash";
import { drawFooter } from "./components/pdf-footer";
import { generateThermalTicket } from "./formats/thermal-ticket";
import { ensureSpace } from "./layout";

const TOTALS_HEIGHT = 76;
const QR_HASH_HEIGHT = 40;

export async function generateInvoice(invoice: Invoice, sellerInfo: SellerInfo, options?: PrintOptions): Promise<jsPDF> {
  const opts: PrintOptions = options || {};

  if (opts.format === "thermal-80mm" || opts.format === "thermal-58mm") {
    return generateThermalTicket(invoice, sellerInfo, opts);
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  const ctx: PdfContext = {
    doc,
    invoice,
    sellerInfo,
    options: opts,
    pageWidth,
    margin,
    contentWidth,
  };

  let y = margin;
  y = await drawHeader(ctx, y);
  y = drawCustomer(ctx, y);
  y = drawItemsTable(ctx, y);

  y = ensureSpace(ctx, y, TOTALS_HEIGHT);
  y = drawTotals(ctx, y);

  y = ensureSpace(ctx, y, QR_HASH_HEIGHT);
  y = await drawQrHash(ctx, y);
  drawFooter(ctx, y);

  const action = opts.action || "download";
  if (action === "download") {
    doc.save(`${invoice.number}.pdf`);
  } else if (action === "print") {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, "_blank");
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      };
    } else {
      // fallback si el popup está bloqueado
      window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }

  return doc;
}
