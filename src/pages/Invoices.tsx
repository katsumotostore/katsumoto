import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useInvoices } from "@/hooks/useInvoices";
import { useInvoiceMutations } from "@/hooks/useInvoiceMutations";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/data-table/PaginationControls";
import { HelpHint } from "@/components/HelpHint";
import { HELP_TEXTS } from "@/lib/help-texts";
import type { Invoice } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2, AlertCircle, RefreshCw, FileText, Download, BarChart3 } from "lucide-react";
import { InvoiceFilters } from "@/components/invoices/InvoiceFilters";
import { InvoiceTable } from "@/components/invoices/InvoiceTable";
import { InvoiceDetail } from "@/components/invoices/InvoiceDetail";
import { CreateCreditNote } from "@/components/invoices/CreateCreditNote";
import { CreateDebitNote } from "@/components/invoices/CreateDebitNote";
import { SalesReportDialog } from "@/components/invoices/SalesReportDialog";
import { AccountingReportDialog } from "@/components/invoices/AccountingReportDialog";
import { invoiceService } from "@/services/invoice.service";
import { exportInvoicesCSV } from "@/lib/export";
import { showSuccess } from "@/utils/toast";

export default function Invoices() {
  const { branchInvoices, getBranchName, selectedBranchId, isLoading, error } = useInvoices();
  const { updateStatus } = useInvoiceMutations();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [ncInvoice, setNcInvoice] = useState<Invoice | null>(null);
  const [ndInvoice, setNdInvoice] = useState<Invoice | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [accountingOpen, setAccountingOpen] = useState(false);

  const handleExportCSV = () => {
    exportInvoicesCSV(filtered, { getBranchName });
    showSuccess(`Exportados ${filtered.length} comprobantes a CSV`);
  };

  const handleCreateCreditNote = async (invoice: Invoice) => {
    const full = await invoiceService.getById(invoice.id);
    if (full) setNcInvoice(full);
  };

  const handleCreateDebitNote = async (invoice: Invoice) => {
    const full = await invoiceService.getById(invoice.id);
    if (full) setNdInvoice(full);
  };

  const invoicesWithNC = useMemo(() => {
    const ids = new Set<string>();
    for (const inv of branchInvoices) {
      if (inv.reference_invoice_id && (inv.invoice_type === "nota_credito" || inv.invoice_type === "nota_debito")) {
        ids.add(inv.reference_invoice_id);
      }
    }
    return ids;
  }, [branchInvoices]);

  const filtered = useMemo(
    () =>
      branchInvoices.filter((i) => {
        const matchStatus = statusFilter === "all" || i.status === statusFilter;
        const matchType = typeFilter === "all" || i.invoice_type === typeFilter;
        return matchStatus && matchType;
      }),
    [branchInvoices, statusFilter, typeFilter]
  );

  const pagination = usePagination({ totalItems: filtered.length });
  const paginated = useMemo(
    () => filtered.slice(pagination.startIndex, pagination.endIndex),
    [filtered, pagination.startIndex, pagination.endIndex]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-muted-foreground text-center">Error al cargar los comprobantes</p>
        <p className="text-xs text-muted-foreground">{error.message}</p>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries()} className="rounded-xl">
          <RefreshCw className="w-4 h-4 mr-2" />Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-bold">Comprobantes de Pago</h1>
          <HelpHint {...HELP_TEXTS.invoices} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAccountingOpen(true)} className="rounded-xl">Reporte contable</Button>
          <Button variant="outline" onClick={() => setReportOpen(true)} className="rounded-xl">
            <BarChart3 className="w-4 h-4 mr-2" />Reporte Ventas
          </Button>
          <Button variant="outline" onClick={handleExportCSV} disabled={filtered.length === 0} className="rounded-xl">
            <Download className="w-4 h-4 mr-2" />Exportar CSV
          </Button>
          <Button onClick={() => navigate("/admin/invoices/new")} className="rounded-xl bg-orange-600 hover:bg-orange-700">
            <Plus className="w-4 h-4 mr-2" />Nuevo Comprobante
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground -mt-4">
        {branchInvoices.length} comprobantes{selectedBranchId !== "all" ? ` · ${getBranchName(selectedBranchId)}` : " · Todas las sedes"}
      </p>

      <InvoiceFilters
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        typeFilter={typeFilter}
        onTypeChange={setTypeFilter}
      />

      {branchInvoices.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-lg font-medium text-muted-foreground mb-1">No hay comprobantes</p>
          <p className="text-sm text-muted-foreground mb-4">Emite tu primer comprobante para empezar a registrar ventas.</p>
          <Button onClick={() => navigate("/admin/invoices/new")} className="rounded-xl bg-orange-600 hover:bg-orange-700">
            <Plus className="w-4 h-4 mr-2" />Crear Primer Comprobante
          </Button>
        </div>
      ) : (
      <>
        <InvoiceTable
          invoices={paginated}
          getBranchName={getBranchName}
          onView={setViewInvoice}
          onUpdateStatus={updateStatus}
          onCreateCreditNote={handleCreateCreditNote}
          onCreateDebitNote={handleCreateDebitNote}
          invoicesWithNC={invoicesWithNC}
        />

        <PaginationControls pagination={pagination} totalItems={filtered.length} itemLabel="comprobantes" showPageNumbers />
      </>
      )}

      <AccountingReportDialog open={accountingOpen} onOpenChange={setAccountingOpen} />
      <InvoiceDetail
        invoice={viewInvoice}
        open={!!viewInvoice}
        onOpenChange={(open) => { if (!open) setViewInvoice(null); }}
        getBranchName={getBranchName}
      />

      {ncInvoice && (
        <CreateCreditNote
          invoice={ncInvoice}
          open={!!ncInvoice}
          onOpenChange={(open) => { if (!open) setNcInvoice(null); }}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["invoices"] })}
        />
      )}

      {ndInvoice && (
        <CreateDebitNote
          invoice={ndInvoice}
          open={!!ndInvoice}
          onOpenChange={(open) => { if (!open) setNdInvoice(null); }}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["invoices"] })}
        />
      )}

      <SalesReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        invoices={branchInvoices}
      />
    </div>
  );
}
