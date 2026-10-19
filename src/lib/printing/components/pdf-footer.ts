import type { PdfContext } from "../types";
import { getLegalBasisText, determineTax } from "../../tax-engine";
import { flowText } from "../layout";

export function drawFooter(ctx: PdfContext, y: number): number {
  const { doc, invoice, options, margin, contentWidth } = ctx;
  if (invoice.descripcion_motivo) y = flowText(ctx, `Motivo de la nota: ${invoice.descripcion_motivo}`, y);
  if (invoice.notes) y = flowText(ctx, `Observaciones: ${invoice.notes}`, y);
  if (options.taxConfig && invoice.exonerada_cents > 0) {
    const config = options.taxConfig;
    const determination = determineTax({ ...config, productFamily: null });
    const legal = getLegalBasisText(determination, config.sellerProvinceCode, config.sellerDistrictCode);
    if (legal) y = flowText(ctx, legal, y, 7.5);
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const bottom = doc.internal.pageSize.getHeight() - 14;
    doc.setDrawColor(0);
    doc.setLineWidth(0.25);
    doc.line(margin, bottom - 4, margin + contentWidth, bottom - 4);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(`RUC ${ctx.sellerInfo.ruc} | ${invoice.number}`, margin, bottom);
    doc.text(`Pagina ${page} de ${pages}`, margin + contentWidth, bottom, { align: "right" });
  }
  return y;
}
