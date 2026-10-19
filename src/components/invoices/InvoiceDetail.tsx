import { useState } from "react";
import { formatCents, formatDateLong } from "@/lib/format";
import { INVOICE_TYPES, TAX_AFFECTATION_TYPES, CREDIT_NOTE_REASONS } from "@/lib/constants";
import { statusConfig } from "./invoice-status";
import { InvoiceTotals } from "./InvoiceTotals";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Building2, Send, Loader2, CheckCircle2, AlertTriangle, FileText, Link2, Tag } from "lucide-react";
import { getSellerInfo } from "@/lib/printing/seller-info";
import type { SellerInfo } from "@/lib/printing/seller-info";
import { InvoicePreviewDialog } from "./InvoicePreviewDialog";
import { useTaxConfig } from "@/lib/tax-config-context";
import { useSunatMutations } from "@/hooks/useSunatConfig";
import { invoiceService } from "@/services/invoice.service";
import { showError } from "@/utils/toast";
import type { Invoice } from "@/lib/types";

const salesChannelLabels: Record<string, string> = {
  pos: "POS",
  admin_online_pos: "POS Tienda Virtual",
  web_public: "Web Pública",
  admin_manual: "Manual",
};

interface InvoiceDetailProps {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getBranchName: (id: string) => string;
}

export function InvoiceDetail({ invoice, open, onOpenChange, getBranchName }: InvoiceDetailProps) {
  const { taxConfig } = useTaxConfig();
  const { sendInvoice, isSending } = useSunatMutations();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSellerInfo, setPreviewSellerInfo] = useState<SellerInfo | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const handlePreview = async () => {
    if (!invoice || loadingPreview) return;
    setLoadingPreview(true);
    try {
      const sellerInfo = await getSellerInfo(invoice.branch_id);
      setPreviewSellerInfo(sellerInfo);
      const full = await invoiceService.getById(invoice.id);
      if (!full) throw new Error("No se encontro el comprobante");
      setPreviewInvoice(full);
      setPreviewOpen(true);
    } catch {
      showError("No se pudo cargar el comprobante completo. Intenta nuevamente.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const getPrintOptions = () => {
    if (!invoice) return undefined;
    const pdfTaxConfig = taxConfig.sellerProvinceCode
      ? {
          sellerProvinceCode: taxConfig.sellerProvinceCode,
          sellerDistrictCode: taxConfig.sellerDistrictCode || undefined,
          selvaLawEnabled: taxConfig.selvaLawEnabled,
        }
      : undefined;
    return { branchName: getBranchName(invoice.branch_id), taxConfig: pdfTaxConfig };
  };

  if (!invoice) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-xl flex items-center gap-3 flex-wrap">
              <span className="font-mono">{invoice.number}</span>
              <Badge variant="secondary" className="text-xs">{INVOICE_TYPES[invoice.invoice_type]?.label}</Badge>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[invoice.status].color}`}>
                {statusConfig[invoice.status].label}
              </span>
            </DialogTitle>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={handlePreview} disabled={loadingPreview}>
              {loadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}PDF
            </Button>
            {invoice.status === "issued" && !invoice.sunat_hash && (
              <Button
                size="sm"
                className="rounded-xl gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => sendInvoice(invoice.id)}
                disabled={isSending}
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar a SUNAT
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Cliente</p>
              <p className="font-medium">{invoice.customer?.name}</p>
              <p className="text-xs text-muted-foreground">{invoice.customer?.document_type}: {invoice.customer?.document_number}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fecha de Emisión</p>
              <p className="font-medium">{formatDateLong(invoice.issue_date)}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3" />{getBranchName(invoice.branch_id)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Canal: {salesChannelLabels[invoice.sales_channel || "admin_manual"] || invoice.sales_channel}
                {invoice.stock_branch_id && invoice.stock_branch_id !== invoice.branch_id
                  ? ` · Stock: ${getBranchName(invoice.stock_branch_id)}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground">Producto</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">Cant.</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">Precio</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">Desc.</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-muted-foreground">Afectación</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">IGV</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items?.map((item, i) => {
                  const taxInfo = TAX_AFFECTATION_TYPES[item.tax_affectation || "gravado"];
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2.5 px-3">
                        <p>{item.product_name}</p>
                        {item.product_sku && <p className="text-xs text-muted-foreground">{item.product_sku}</p>}
                      </td>
                      <td className="py-2.5 px-3 text-right">{item.quantity}</td>
                      <td className="py-2.5 px-3 text-right">{formatCents(item.unit_price_cents)}</td>
                      <td className="py-2.5 px-3 text-right">{item.discount_percent}%</td>
                      <td className="py-2.5 px-3 text-center">
                        {taxInfo && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold border ${taxInfo.color}`}>
                            {taxInfo.label} {taxInfo.rate}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {item.igv_cents > 0 ? formatCents(item.igv_cents) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">{formatCents(item.line_total_cents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <InvoiceTotals invoice={invoice} />

          {invoice.notes && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Observaciones</p>
              <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">{invoice.notes}</p>
            </div>
          )}

          {invoice.invoice_type === "nota_credito" && invoice.motivo_nota && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1">
                <Tag className="w-3 h-3" />Nota de Crédito
              </p>
              <div className="mt-1 space-y-0.5 text-xs text-blue-800 dark:text-blue-300">
                <p>Motivo: <span className="font-medium">[{invoice.motivo_nota}] {CREDIT_NOTE_REASONS[invoice.motivo_nota]?.label || invoice.motivo_nota}</span></p>
                {invoice.descripcion_motivo && <p>Descripción: {invoice.descripcion_motivo}</p>}
              </div>
            </div>
          )}

          {invoice.reference_invoice_id && (
            <div className="p-3 bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-slate-200 dark:border-slate-800">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Link2 className="w-3 h-3" />Comprobante referenciado
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 font-mono">
                Este documento referencia a otro comprobante (ID: {invoice.reference_invoice_id.substring(0, 8)}...)
              </p>
            </div>
          )}

          {invoice.sunat_hash && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />Aceptado por SUNAT
              </p>
              <div className="mt-1 space-y-0.5 text-xs text-emerald-800 dark:text-emerald-300">
                <p>Hash: <span className="font-mono">{invoice.sunat_hash}</span></p>
                {invoice.sunat_sent_at && <p>Enviado: {formatDateLong(invoice.sunat_sent_at)}</p>}
                {invoice.sunat_accepted_at && <p>Aceptado: {formatDateLong(invoice.sunat_accepted_at)}</p>}
                {invoice.sunat_xml_path && (
                  <p className="flex items-center gap-1"><FileText className="w-3 h-3" />XML almacenado</p>
                )}
              </div>
            </div>
          )}

          {invoice.sunat_error_code && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800">
              <p className="text-xs font-medium text-red-700 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />Error SUNAT
              </p>
              <p className="text-sm text-red-800 dark:text-red-300 mt-1">
                [{invoice.sunat_error_code}] {invoice.sunat_error_message}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <InvoicePreviewDialog
      invoice={previewInvoice}
      sellerInfo={previewSellerInfo}
      printOptions={getPrintOptions()}
      open={previewOpen}
      onOpenChange={setPreviewOpen}
    />
    </>
  );
}
