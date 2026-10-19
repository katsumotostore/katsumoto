import { useState } from "react";
import { formatCents, formatDateLong } from "@/lib/format";
import { INVOICE_TYPES } from "@/lib/constants";
import { statusConfig } from "./invoice-status";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle, Eye, ShieldCheck, Receipt, Download, Building2, Loader2, Send, AlertTriangle, CheckCircle2, Trash2, FileMinus2, FilePlus2 } from "lucide-react";
import { getSellerInfo } from "@/lib/printing/seller-info";
import type { SellerInfo } from "@/lib/printing/seller-info";
import { useTaxConfig } from "@/lib/tax-config-context";
import { useSunatMutations } from "@/hooks/useSunatConfig";
import { InvoicePreviewDialog } from "./InvoicePreviewDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Invoice, InvoiceStatus } from "@/lib/types";
import { showError } from "@/utils/toast";

const salesChannelLabels: Record<string, string> = {
  pos: "POS",
  admin_online_pos: "POS Tienda Virtual",
  web_public: "Web Pública",
  admin_manual: "Manual",
};

interface InvoiceTableProps {
  invoices: Invoice[];
  getBranchName: (id: string) => string;
  onView: (invoice: Invoice) => void;
  onUpdateStatus: (id: string, status: InvoiceStatus) => void;
  onCreateCreditNote?: (invoice: Invoice) => void;
  onCreateDebitNote?: (invoice: Invoice) => void;
  invoicesWithNC?: Set<string>;
}

export function InvoiceTable({ invoices, getBranchName, onView, onUpdateStatus, onCreateCreditNote, onCreateDebitNote, invoicesWithNC }: InvoiceTableProps) {
  const { taxConfig } = useTaxConfig();
  const { sendInvoice, isSending: _isSending, sendVoided, isSendingVoided: _isSendingVoided } = useSunatMutations();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidDialogId, setVoidDialogId] = useState<string | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [previewSellerInfo, setPreviewSellerInfo] = useState<SellerInfo | null>(null);

  const handleSendSunat = (id: string) => {
    setSendingId(id);
    sendInvoice(id, {
      onSettled: () => setSendingId(null),
    });
  };

  const handleVoided = (invoiceId: string, motivo?: string) => {
    setVoidingId(invoiceId);
    sendVoided({ invoiceId, motivo }, {
      onSettled: () => setVoidingId(null),
    });
  };

  const downloadPdf = async (invoice: Invoice) => {
    const _pdfTaxConfig = taxConfig.sellerProvinceCode
      ? {
          sellerProvinceCode: taxConfig.sellerProvinceCode,
          sellerDistrictCode: taxConfig.sellerDistrictCode || undefined,
          selvaLawEnabled: taxConfig.selvaLawEnabled,
        }
      : undefined;
    try {
      const sellerInfo = await getSellerInfo(invoice.branch_id);
      setPreviewInvoice(invoice);
      setPreviewSellerInfo(sellerInfo);
    } catch {
      showError("No se pudieron cargar los datos de la sede. Intenta nuevamente.");
    }
  };

  const getPrintOptions = () => {
    if (!previewInvoice) return undefined;
    const _pdfTaxConfig = taxConfig.sellerProvinceCode
      ? {
          sellerProvinceCode: taxConfig.sellerProvinceCode,
          sellerDistrictCode: taxConfig.sellerDistrictCode || undefined,
          selvaLawEnabled: taxConfig.selvaLawEnabled,
        }
      : undefined;
    return { branchName: getBranchName(previewInvoice.branch_id), taxConfig: _pdfTaxConfig };
  };
  if (invoices.length === 0) {
    return (
      <div className="text-center py-16">
        <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">No se encontraron comprobantes</p>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-3">
      {invoices.map((invoice) => {
        const st = statusConfig[invoice.status];
        const typeInfo = INVOICE_TYPES[invoice.invoice_type];
        const branchName = getBranchName(invoice.branch_id);
        return (
          <Card key={invoice.id} className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 bg-orange-50 dark:bg-orange-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Receipt className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono font-bold text-sm">{invoice.number}</span>
                      <Badge variant="secondary" className="text-[10px] rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {typeInfo?.label || invoice.invoice_type}
                      </Badge>
                      {invoicesWithNC?.has(invoice.id) && (
                        <Badge variant="secondary" className="text-[10px] rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                          NC emitida
                        </Badge>
                      )}
                      {invoice.invoice_type === "nota_credito" && invoice.reference_invoice_id && (
                        <Badge variant="secondary" className="text-[10px] rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                          NC
                        </Badge>
                      )}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${st.color}`}>
                        <st.icon className="w-3 h-3" />{st.label}
                      </span>
                      {invoice.sales_channel && (
                        <Badge variant="secondary" className="text-[10px] rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                          {salesChannelLabels[invoice.sales_channel] || invoice.sales_channel}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground font-medium">{invoice.customer?.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {invoice.customer?.document_type}: {invoice.customer?.document_number}
                      {" · "}
                      {formatDateLong(invoice.issue_date)}
                      {" · "}
                      {invoice.items?.length || 0} ítem{(invoice.items?.length || 0) !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Building2 className="w-3 h-3" />{branchName}
                    </p>
                    {invoice.sunat_hash && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />SUNAT: {invoice.sunat_hash.substring(0, 12)}...
                      </p>
                    )}
                    {invoice.sunat_error_code && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />SUNAT [{invoice.sunat_error_code}]: {invoice.sunat_error_message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-lg font-bold">{formatCents(invoice.total_cents)}</p>
                  <div className="flex gap-1">
                    <button onClick={() => onView(invoice)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="Ver detalle">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => downloadPdf(invoice)} className="p-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors" title="Descargar PDF">
                      <Download className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    </button>
                    {invoice.status === "issued" && (
                      <Button size="sm" variant="outline" className="rounded-xl text-xs h-8" onClick={() => onUpdateStatus(invoice.id, "accepted")}>
                        <ShieldCheck className="w-3 h-3 mr-1" />Aceptar
                      </Button>
                    )}
                    {invoice.status === "issued" && !invoice.sunat_hash && invoice.invoice_type !== "boleta" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-xs h-8 text-orange-600 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                        onClick={() => handleSendSunat(invoice.id)}
                        disabled={sendingId === invoice.id}
                      >
                        {sendingId === invoice.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                        SUNAT
                      </Button>
                    )}
                    {invoice.status === "accepted" && invoice.sunat_hash && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl text-xs h-8 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => setVoidDialogId(invoice.id)}
                          disabled={voidingId === invoice.id}
                        >
                          {voidingId === invoice.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                          Baja
                        </Button>
                        {!invoicesWithNC?.has(invoice.id) && invoice.invoice_type !== "nota_credito" && invoice.invoice_type !== "nota_debito" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl text-xs h-8 text-orange-600 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                              onClick={() => onCreateCreditNote?.(invoice)}
                            >
                              <FileMinus2 className="w-3 h-3 mr-1" />
                              NC
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl text-xs h-8 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={() => onCreateDebitNote?.(invoice)}
                            >
                              <FilePlus2 className="w-3 h-3 mr-1" />
                              ND
                            </Button>
                          </>
                        )}
                      </>
                    )}
                    {(invoice.status === "issued" || invoice.status === "accepted") && (
                      <Button size="sm" variant="outline" className="rounded-xl text-xs h-8" onClick={() => onUpdateStatus(invoice.id, "paid")}>
                        <CheckCircle className="w-3 h-3 mr-1" />Pagado
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      </div>

      <AlertDialog open={!!voidDialogId} onOpenChange={(open) => { if (!open) setVoidDialogId(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Dar de baja este comprobante?</AlertDialogTitle>
            <AlertDialogDescription>Se enviará una comunicación de baja a SUNAT. Esta acción no se puede deshacer y tiene implicaciones fiscales.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (voidDialogId) handleVoided(voidDialogId);
                setVoidDialogId(null);
              }}
              className="rounded-xl bg-red-600 hover:bg-red-700"
            >
              Dar de Baja
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InvoicePreviewDialog
        invoice={previewInvoice}
        sellerInfo={previewSellerInfo}
        printOptions={getPrintOptions()}
        open={!!previewInvoice}
        onOpenChange={(open) => { if (!open) { setPreviewInvoice(null); setPreviewSellerInfo(null); } }}
      />
    </>
  );
}
