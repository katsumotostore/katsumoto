import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useBranches } from "@/hooks/useBranches";
import { reportService } from "@/services/report.service";
import { invoiceService } from "@/services/invoice.service";
import { queryKeys } from "@/lib/query-keys";
import type { Invoice } from "@/lib/types";

function getDateRange(months: number = 1) {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(
    now.getFullYear(),
    now.getMonth() - months,
    now.getDate() + 1
  );
  return {
    dateFrom: format(from, "yyyy-MM-dd"),
    dateTo: format(to, "yyyy-MM-dd"),
  };
}

export function useAccountingReport() {
  const { selectedBranchId, getBranchName } = useBranches();
  const defaultRange = useMemo(() => getDateRange(1), []);
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [invoiceType, setInvoiceType] = useState("all");
  const [status, setStatus] = useState("all");
  const [sunatStatus, setSunatStatus] = useState("all");

  const {
    data: invoices = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.reports.accounting(
      dateFrom,
      dateTo,
      selectedBranchId
    ),
    queryFn: () =>
      reportService.getAccountingReport({
        dateFrom,
        dateTo,
        branchId: selectedBranchId,
      }),
    staleTime: 30 * 1000,
  });

  const allInvoices = useQuery({
    queryKey: queryKeys.invoices.all,
    queryFn: () => invoiceService.getAll(),
    staleTime: 60 * 1000,
    enabled: invoices.some((i) => i.reference_invoice_id),
  });

  const getReference = useMemo(() => {
    const map = new Map<string, Invoice>();
    if (allInvoices.data) {
      for (const inv of allInvoices.data) map.set(inv.id, inv);
    }
    return (id: string) => map.get(id);
  }, [allInvoices.data]);

  const rows = useMemo(() => {
    let filtered = invoices;
    if (invoiceType !== "all") {
      filtered = filtered.filter((i) => i.invoice_type === invoiceType);
    }
    if (status !== "all") {
      filtered = filtered.filter((i) => i.status === status);
    }
    if (sunatStatus !== "all") {
      filtered = filtered.filter((i) => {
        const ss = reportService.mapToAccountingRows([i], getReference)[0]
          .sunatStatus;
        return ss === sunatStatus;
      });
    }
    return reportService.mapToAccountingRows(filtered, getReference);
  }, [invoices, invoiceType, status, sunatStatus, getReference]);

  const summary = useMemo(
    () => reportService.getAccountingSummary(rows),
    [rows]
  );

  return {
    rows,
    summary,
    rawInvoices: invoices,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    invoiceType,
    setInvoiceType,
    status,
    setStatus,
    sunatStatus,
    setSunatStatus,
    selectedBranchId,
    getBranchName,
    isLoading,
    error,
    refetch,
  };
}

export function useSalesReport() {
  const { selectedBranchId } = useBranches();
  const defaultRange = useMemo(() => getDateRange(3), []);
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("month");
  const [invoiceType, setInvoiceType] = useState("all");

  const {
    data: invoices = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.reports.sales(dateFrom, dateTo, selectedBranchId),
    queryFn: () =>
      reportService.getAccountingReport({
        dateFrom,
        dateTo,
        branchId: selectedBranchId,
      }),
    staleTime: 30 * 1000,
  });

  const filtered = useMemo(() => {
    if (invoiceType === "all") return invoices;
    return invoices.filter((i) => i.invoice_type === invoiceType);
  }, [invoices, invoiceType]);

  const periods = useMemo(() => {
    const map = new Map<
      string,
      {
        period: string;
        totalFacturas: number;
        totalBoletas: number;
        totalNotasCredito: number;
        totalNotasDebito: number;
        gravada: number;
        exonerada: number;
        inafecta: number;
        igv: number;
        total: number;
      }
    >();

    for (const inv of filtered) {
      const d = parseISO(inv.issue_date);
      let key: string;
      let label: string;

      if (groupBy === "day") {
        key = inv.issue_date;
        label = inv.issue_date;
      } else if (groupBy === "week") {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        key = format(startOfWeek, "yyyy-MM-dd");
        label = `Sem ${key}`;
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        label = key;
      }

      const existing = map.get(key) || {
        period: label,
        totalFacturas: 0,
        totalBoletas: 0,
        totalNotasCredito: 0,
        totalNotasDebito: 0,
        gravada: 0,
        exonerada: 0,
        inafecta: 0,
        igv: 0,
        total: 0,
      };

      if (inv.invoice_type === "factura") existing.totalFacturas++;
      else if (inv.invoice_type === "boleta") existing.totalBoletas++;
      else if (inv.invoice_type === "nota_credito")
        existing.totalNotasCredito++;
      else if (inv.invoice_type === "nota_debito")
        existing.totalNotasDebito++;

      const sign = inv.invoice_type === "nota_credito" ? -1 : 1;
      existing.gravada += sign * inv.gravada_cents;
      existing.exonerada += sign * inv.exonerada_cents;
      existing.inafecta += sign * inv.inafecta_cents;
      existing.igv += sign * inv.igv_cents;
      existing.total += sign * inv.total_cents;

      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.period.localeCompare(b.period)
    );
  }, [filtered, groupBy]);

  const totals = useMemo(
    () =>
      periods.reduce(
        (acc, p) => ({
          totalFacturas: acc.totalFacturas + p.totalFacturas,
          totalBoletas: acc.totalBoletas + p.totalBoletas,
          totalNotasCredito: acc.totalNotasCredito + p.totalNotasCredito,
          totalNotasDebito: acc.totalNotasDebito + p.totalNotasDebito,
          gravada: acc.gravada + p.gravada,
          exonerada: acc.exonerada + p.exonerada,
          inafecta: acc.inafecta + p.inafecta,
          igv: acc.igv + p.igv,
          total: acc.total + p.total,
        }),
        {
          totalFacturas: 0,
          totalBoletas: 0,
          totalNotasCredito: 0,
          totalNotasDebito: 0,
          gravada: 0,
          exonerada: 0,
          inafecta: 0,
          igv: 0,
          total: 0,
        }
      ),
    [periods]
  );

  return {
    periods,
    totals,
    rawInvoices: filtered,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    groupBy,
    setGroupBy,
    invoiceType,
    setInvoiceType,
    selectedBranchId,
    isLoading,
    error,
  };
}
