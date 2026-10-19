import { useState, useRef, useCallback, useMemo } from "react";
import { useBranches } from "@/hooks/useBranches";
import { useRegisters } from "@/hooks/useRegisters";
import { useRegisterMutations } from "@/hooks/useRegisterMutations";
import { useClients } from "@/hooks/useClients";
import { useClientMutations } from "@/hooks/useClientMutations";
import { useTaxConfig } from "@/lib/tax-config-context";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { invoiceService } from "@/services/invoice.service";
import { registerService } from "@/services/register.service";
import { customerService } from "@/services/customer.service";
import { formatInvoiceNumber } from "@/lib/format";
import { getBranchStock } from "@/lib/utils/stock";
import { INVOICE_TYPES } from "@/lib/constants";
import { queryKeys } from "@/lib/query-keys";
import type {
  Invoice,
  InvoiceType,
  InvoiceItemFormData,
  PaymentMethod,
} from "@/lib/types";
import type { InvoiceCalculation } from "@/lib/calculations";
import type { CartItem } from "@/components/pos/PosCart";
import type { LookupResult } from "@/components/CustomerLookup";
import { generateInvoicePDF } from "@/lib/pdf";
import { getSellerInfo } from "@/lib/printing/seller-info";
import { openPdfInTab } from "@/lib/printing/open";
import { showSuccess, showError } from "@/utils/toast";

const CONSUMIDOR_FINAL_DNI = "00000000";

export function usePosInvoice(cart: CartItem[], calc: InvoiceCalculation | null) {
  const queryClient = useQueryClient();
  const { branches, branchStocks, selectedBranchId, findBranch } = useBranches();
  const { registers, activeRegister } = useRegisters();
  const { openRegister: openRegisterMutation } = useRegisterMutations();
  const { clients } = useClients();
  const { saveClientAsync } = useClientMutations();
  const { taxConfig } = useTaxConfig();

  const [invoiceType, setInvoiceType] = useState<InvoiceType>("boleta");
  const [clientId, setClientId] = useState<string>("none");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [lastInvoiceId, setLastInvoiceId] = useState<string | null>(null);
  const [lastCashReceivedCents, setLastCashReceivedCents] = useState<number | undefined>(undefined);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState<string | undefined>();
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);
  const [openRegisterAmount, setOpenRegisterAmount] = useState("");
  const [showOpenRegister, setShowOpenRegister] = useState(false);

  const invoiceTypeRef = useRef(invoiceType);
  invoiceTypeRef.current = invoiceType;

  const branchId = selectedBranchId;
  const activeBranch = branchId !== "all" ? findBranch(branchId) : null;
  const isWarehouse = activeBranch?.type === "warehouse";
  const openRegister = activeRegister;

  const canSell = !!(activeBranch && !isWarehouse && openRegister);
  const registerNeedsOpen = !!(activeBranch && !isWarehouse && !openRegister);

  const defaultCustomer = useMemo(
    () => clients.find((c) => c.document_number === CONSUMIDOR_FINAL_DNI && c.document_type === "DNI") ?? null,
    [clients],
  );

  const handleOpenRegister = useCallback(() => {
    if (!activeBranch) return;
    const existingOpen = registers.find(
      (r) => r.branch_id === activeBranch.id && r.status === "open"
    );
    if (existingOpen) {
      showError(`Ya existe una caja abierta para ${activeBranch.name} (Caja #${existingOpen.number})`);
      setShowOpenRegister(false);
      return;
    }
    const amount = Math.round(Number(openRegisterAmount) * 100);
    if (amount < 0) return;
    openRegisterMutation(activeBranch.id, amount);
    setShowOpenRegister(false);
    setOpenRegisterAmount("");
  }, [activeBranch, registers, openRegisterAmount, openRegisterMutation]);

  const handleLookupClient = useCallback(async (data: LookupResult) => {
    const currentType = invoiceTypeRef.current;
    if (currentType === "factura" && data.documentType !== "RUC") {
      showError("Para factura se requiere RUC. Cambie a Boleta para usar DNI.");
      return;
    }
    if (currentType === "boleta" && data.documentType !== "DNI") {
      showError("Para boleta se requiere DNI. Cambie a Factura para usar RUC.");
      return;
    }
    const existing = clients.find((c) => c.document_number === data.documentNumber);
    if (existing) {
      setClientId(existing.id);
      return;
    }
    try {
      const created = await saveClientAsync({
        name: data.name,
        document_type: data.documentType,
        document_number: data.documentNumber,
        phone: data.phone || "",
        email: data.email || "",
        address: data.address || "",
        city: data.city || "",
        department_code: data.department_code || "",
        province_code: data.province_code || "",
        district_code: data.district_code || "",
      }, null);
      if (created && (created as { id: string }).id) {
        setClientId((created as { id: string }).id);
      }
    } catch (err) {
      const msg = (err as Error).message || "";
      if (msg.includes("Ya existe") || msg.includes("duplicate")) {
        const existing = await customerService.findByDocument(data.documentNumber);
        if (existing) {
          setClientId(existing.id);
          showSuccess("Cliente encontrado y seleccionado");
          return;
        }
      }
      showError("Error al registrar cliente");
    }
  }, [clients, saveClientAsync]);

  const handleInvoiceTypeChange = useCallback((type: InvoiceType) => {
    setInvoiceType(type);
    setClientId("none");
  }, []);

  const handleCobrar = useCallback(() => {
    if (!calc || cart.length === 0) return;
    if (!canSell) {
      if (isWarehouse) showError("Los almacenes no realizan ventas.");
      else if (!openRegister) showError("Necesitas abrir una caja para vender.");
      else showError("Selecciona una sede para operar el POS");
      return;
    }
    if (invoiceType === "factura" && (!clientId || clientId === "none")) return;
    if (invoiceType === "boleta" && calc && calc.total_cents > 70000) {
      const docNumber = clientId && clientId !== "none"
        ? clients.find((c) => c.id === clientId)?.document_number
        : "00000000";
      if (!docNumber || docNumber === "00000000") {
        showError("Boletas mayores a S/ 700.00 deben identificar al cliente. Selecciona un cliente con DNI.");
        return;
      }
    }
    for (const item of cart) {
      const currentStock = branchId === "all"
        ? item.product.stock
        : getBranchStock(branchStocks, branchId, item.product.id, branches);
      if (item.quantity > currentStock) {
        showError(`Stock insuficiente para ${item.product.name}. Disponible: ${currentStock}, en carrito: ${item.quantity}`);
        return;
      }
    }
    setPaymentOpen(true);
  }, [calc, cart, canSell, isWarehouse, openRegister, invoiceType, clientId, branchStocks, branchId, branches]);

  const createInvoiceMutation = useMutation({
    mutationFn: async ({
      method,
    }: {
      method: PaymentMethod;
    }) => {
      if (!calc || !openRegister || !activeBranch) return null;
      const selectedId = clientId && clientId !== "none"
        ? clientId
        : invoiceType === "boleta" ? defaultCustomer?.id : undefined;
      if (!selectedId) {
        throw new Error("Selecciona un cliente valido antes de emitir el comprobante.");
      }
      const customer = await customerService.getInvoiceCustomer(selectedId, invoiceType);

      if (!customer) {
        showError("No se encontró el cliente 'Consumidor Final' (DNI 00000000). Créelo en Clientes.");
        return null;
      }

      const cartSkuMap = new Map(cart.map((c) => [c.product.id, c.product.sku] as const));

      const rpcItems: InvoiceItemFormData[] = calc.items.map((item) => ({
        product_id: item.product_id || undefined,
        product_name: item.product_name,
        product_sku: item.product_id ? (cartSkuMap.get(item.product_id) || undefined) : undefined,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
        discount_percent: item.discount_percent,
        tax_affectation: item.tax_affectation,
      }));

      const result = await invoiceService.createWithItems(
        {
          customer_id: customer.id,
          invoice_type: invoiceType,
          issue_date: new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
          }).format(new Date()),
          items: rpcItems,
        },
        activeBranch.id,
        method,
        openRegister.id,
        null,
        activeBranch.type === "online" ? "admin_online_pos" : "pos",
      );

      const invoiceNumber = formatInvoiceNumber(result.serie, result.correlativo);

      if (method !== "credit") {
        await registerService.addTransaction(
          openRegister.id,
          method,
          calc.total_cents,
          `[POS] ${invoiceNumber}`
        );
      }

      return { invoiceId: result.id, invoiceNumber };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.registers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.movements.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.branches.allStock });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      if (result?.invoiceId) {
        setLastInvoiceId(result.invoiceId);
        invoiceService.getById(result.invoiceId).then((inv) => {
          if (inv) setLastInvoice(inv);
        }).catch(() => {});
      }
    },
  });

  const { data: fetchedInvoice } = useQuery({
    queryKey: lastInvoiceId ? queryKeys.invoices.detail(lastInvoiceId) : ["invoices", "null"],
    queryFn: () => invoiceService.getById(lastInvoiceId!),
    enabled: !!lastInvoiceId,
    staleTime: 0,
  });

  const lastInvoiceData = lastInvoiceId ? (fetchedInvoice ?? lastInvoice) : null;

  const handleConfirmPayment = useCallback((method: PaymentMethod, receivedCents?: number) => {
    if (!calc || !canSell || !openRegister || !activeBranch) return;
    if (method === "cash" && receivedCents !== undefined) {
      setLastCashReceivedCents(receivedCents);
    } else {
      setLastCashReceivedCents(undefined);
    }

    createInvoiceMutation.mutate({ method }, {
      onSuccess: (result) => {
        if (result?.invoiceNumber) {
          setLastInvoiceNumber(result.invoiceNumber);
          showSuccess(`${INVOICE_TYPES[invoiceType].label} ${result.invoiceNumber} emitida`);
        }
      },
      onError: (err: Error) => {
        const isStockError = err.message?.includes("Stock insuficiente");
        if (isStockError) {
          queryClient.invalidateQueries({ queryKey: queryKeys.branches.allStock });
          queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
          showError(`No se pudo emitir: ${err.message}. El stock se ha actualizado, intenta nuevamente.`);
        } else {
          showError(`Error al emitir: ${err.message}`);
        }
      },
    });
  }, [calc, canSell, openRegister, invoiceType, clientId, clients, cart, activeBranch, createInvoiceMutation, queryClient]);

  const handlePrintA4 = useCallback(async () => {
    if (!lastInvoiceId) return;
    const pdfTaxConfig = taxConfig.sellerProvinceCode
      ? {
          sellerProvinceCode: taxConfig.sellerProvinceCode,
          sellerDistrictCode: taxConfig.sellerDistrictCode || undefined,
          selvaLawEnabled: taxConfig.selvaLawEnabled,
        }
      : undefined;
    try {
      const inv = await invoiceService.getById(lastInvoiceId);
      if (!inv) return;
      const sellerInfo = await getSellerInfo(inv.branch_id);
      await openPdfInTab(() =>
        generateInvoicePDF(inv, sellerInfo, { branchName: activeBranch?.name, taxConfig: pdfTaxConfig, action: "preview" })
      );
    } catch (e) {
      showError("Error al generar PDF: " + (e as Error).message);
    }
  }, [lastInvoiceId, activeBranch, taxConfig]);

  const handlePrintTicket = useCallback(async () => {
    if (!lastInvoiceId) return;
    const pdfTaxConfig = taxConfig.sellerProvinceCode
      ? {
          sellerProvinceCode: taxConfig.sellerProvinceCode,
          sellerDistrictCode: taxConfig.sellerDistrictCode || undefined,
          selvaLawEnabled: taxConfig.selvaLawEnabled,
        }
      : undefined;
    try {
      const inv = await invoiceService.getById(lastInvoiceId);
      if (!inv) return;
      const sellerInfo = await getSellerInfo(inv.branch_id);
      await openPdfInTab(() =>
        import("@/lib/printing/formats/thermal-ticket").then(m =>
          m.generateThermalTicket(inv, sellerInfo, {
            format: "thermal-58mm",
            branchName: activeBranch?.name,
            taxConfig: pdfTaxConfig,
            cashReceivedCents: lastCashReceivedCents,
            action: "preview",
          })
        )
      );
    } catch (e) {
      showError("Error al imprimir ticket: " + (e as Error).message);
    }
  }, [lastInvoiceId, activeBranch, taxConfig]);

  const handleClosePayment = useCallback(() => {
    setPaymentOpen(false);
    setLastCashReceivedCents(undefined);
    if (lastInvoiceNumber) {
      setLastInvoiceNumber(undefined);
      setLastInvoiceId(null);
      setLastInvoice(null);
    }
  }, [lastInvoiceNumber]);

  return {
    invoiceType,
    clientId,
    setClientId,
    paymentOpen,
    lastInvoiceNumber,
    openRegisterAmount,
    setOpenRegisterAmount,
    showOpenRegister,
    setShowOpenRegister,
    activeBranch,
    isWarehouse,
    openRegister,
    canSell,
    registerNeedsOpen,
    clients,
    handleOpenRegister,
    handleLookupClient,
    handleInvoiceTypeChange,
    handleCobrar,
    handleConfirmPayment,
    isPaymentPending: createInvoiceMutation.isPending,
    handlePrintA4,
    handlePrintTicket,
    handleClosePayment,
  };
}
