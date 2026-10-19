import { useState, useCallback } from "react";
import { usePlatform, loadPrinterConfig, savePrinterConfig } from "@/lib/platform";
import { buildEscposReceipt, buildTestReceipt, type ReceiptOptions, type PaperWidth } from "@/lib/printing/thermal";
import { generateThermalTicket } from "@/lib/printing/formats/thermal-ticket";
import { openPdfInTab } from "@/lib/printing/open";
import { getSellerInfo } from "@/lib/printing/seller-info";
import type { Invoice } from "@/lib/types";
import type { PrinterConfig } from "@/lib/platform";

export type PrinterStatus = "ready" | "disconnected" | "no-config" | "error" | "checking";

export interface UsePrinterReturn {
  printReceipt: (invoice: Invoice, opts?: Partial<ReceiptOptions>) => Promise<void>;
  reprintReceipt: (invoice: Invoice) => Promise<void>;
  printTest: () => Promise<void>;
  openCashDrawer: () => Promise<void>;
  isReady: boolean;
  isTauri: boolean;
  isPrinting: boolean;
  status: PrinterStatus;
  config: PrinterConfig;
  updateConfig: (partial: Partial<PrinterConfig>) => void;
  refreshStatus: () => Promise<void>;
}

const PRINT_RETRIES = 1;

export function usePrinter(): UsePrinterReturn {
  const { printer, isTauri } = usePlatform();
  const [isPrinting, setIsPrinting] = useState(false);
  const [status, setStatus] = useState<PrinterStatus>("no-config");
  const [config, setConfig] = useState<PrinterConfig>(loadPrinterConfig);

  const refreshStatus = useCallback(async () => {
    setStatus("checking");
    try {
      const s = await printer.getStatus();
      setStatus(s as PrinterStatus);
    } catch {
      setStatus("error");
    }
  }, [printer]);

  const updateConfig = useCallback((partial: Partial<PrinterConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      savePrinterConfig(next);
      return next;
    });
  }, []);

  const _doPrint = useCallback(async (invoice: Invoice, opts?: Partial<ReceiptOptions>) => {
    const sellerInfo = await getSellerInfo(invoice.branch_id);
    const receiptOpts: ReceiptOptions = {
      paperWidth: config.paperWidth as PaperWidth,
      autoCut: config.autoCut,
      openDrawer: config.openDrawer,
      copies: config.copies,
      ...opts,
    };

    if (isTauri && config.connectionType !== "browser-pdf") {
      const escpos = buildEscposReceipt(invoice, sellerInfo, receiptOpts);
      await printer.printReceipt(escpos);
    } else {
      await openPdfInTab(() => generateThermalTicket(invoice, sellerInfo, {
        format: "thermal-80mm",
        action: "preview",
      }));
    }
  }, [config, isTauri, printer]);

  const printReceipt = useCallback(async (invoice: Invoice, opts?: Partial<ReceiptOptions>, retries = PRINT_RETRIES) => {
    setIsPrinting(true);
    try {
      await _doPrint(invoice, opts);
    } catch (err) {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        setIsPrinting(false);
        return printReceipt(invoice, opts, retries - 1);
      }
      throw err;
    } finally {
      setIsPrinting(false);
    }
  }, [_doPrint]);

  const reprintReceipt = useCallback(async (invoice: Invoice) => {
    await printReceipt(invoice, { isReprint: true });
  }, [printReceipt]);

  const printTest = useCallback(async () => {
    setIsPrinting(true);
    try {
      if (isTauri && config.connectionType !== "browser-pdf") {
        const result = buildTestReceipt(config.paperWidth as PaperWidth);
        await printer.printReceipt(result.escpos);
      } else {
        await printer.printTest();
      }
    } finally {
      setIsPrinting(false);
    }
  }, [config, isTauri, printer]);

  const openCashDrawer = useCallback(async () => {
    if (printer.supportsCashDrawer) {
      await printer.openCashDrawer();
    }
  }, [printer]);

  const isReady = status === "ready" || (!isTauri);

  return {
    printReceipt,
    reprintReceipt,
    printTest,
    openCashDrawer,
    isReady,
    isTauri,
    isPrinting,
    status,
    config,
    updateConfig,
    refreshStatus,
  };
}
