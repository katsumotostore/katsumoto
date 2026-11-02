import { useState, useRef, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getBranchStock } from "@/lib/utils/stock";
import { useBranches } from "@/hooks/useBranches";
import { useProducts } from "@/hooks/useProducts";
import { useClients } from "@/hooks/useClients";
import { useClientMutations } from "@/hooks/useClientMutations";
import { useInvoices } from "@/hooks/useInvoices";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoiceService } from "@/services/invoice.service";
import { customerService } from "@/services/customer.service";
import { toCents, formatInvoiceNumber } from "@/lib/format";
import { calculateInvoice } from "@/lib/calculations";
import { INVOICE_TYPES, DEFAULT_SERIES } from "@/lib/constants";
import { createInvoiceFormSchema, type CreateInvoiceFormValues } from "@/lib/schemas";
import { queryKeys } from "@/lib/query-keys";
import type { InvoiceItemFormData, Cents, InvoiceType, TaxAffectation } from "@/lib/types";
import { HelpHint } from "@/components/HelpHint";
import { HELP_TEXTS } from "@/lib/help-texts";
import type { LookupResult } from "@/components/CustomerLookup";
import { CustomerLookup } from "@/components/CustomerLookup";
import { InvoiceItemEditor } from "@/components/invoices/InvoiceItemEditor";
import { InvoiceCalcTotals } from "@/components/invoices/InvoiceCalcTotals";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Warehouse, Search, Loader2 } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";

export default function CreateInvoice() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { branches, branchStocks, selectedBranchId, findBranch, isLoading: branchesLoading } = useBranches();
  const { products, isLoading: productsLoading } = useProducts();
  const { clients, isLoading: clientsLoading } = useClients();
  const { saveClientAsync } = useClientMutations();
  const { invoices } = useInvoices();

  const { data: allInvoices = [] } = useQuery({
    queryKey: queryKeys.invoices.all,
    queryFn: () => invoiceService.getAll(),
    staleTime: 60 * 1000,
  });

  const branchId = selectedBranchId;
  const activeBranch = branchId !== "all" ? findBranch(branchId) : null;
  const isWarehouse = activeBranch?.type === "warehouse";
  const canSell = !!(activeBranch && !isWarehouse);

  const { register, handleSubmit, control, setValue, watch, formState: { errors } } = useForm<CreateInvoiceFormValues>({
    resolver: zodResolver(createInvoiceFormSchema),
    defaultValues: {
      invoiceType: "factura",
      clientId: "",
      items: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const [selectedProductId, setSelectedProductId] = useState("");

  const invoiceType = watch("invoiceType") as InvoiceType;
  const clientId = watch("clientId");
  const watchedItems = useMemo(() => watch("items") || [], [watch]);

  const invoiceTypeRef = useRef(invoiceType);
  invoiceTypeRef.current = invoiceType;

  const serie = DEFAULT_SERIES[invoiceType];
  const { existingCount: _existingCount, nextCorrelativo: _nextCorrelativo, nextNumber } = useMemo(() => {
    const existingCount = allInvoices.filter(i => i.serie === serie).length;
    const nextCorrelativo = existingCount + 1;
    const nextNumber = formatInvoiceNumber(serie, nextCorrelativo);
    return { existingCount, nextCorrelativo, nextNumber };
  }, [allInvoices, serie]);

  const availableClients = useMemo(() => clients.filter((c) => {
    if (invoiceType === "factura" || invoiceType === "nota_credito" || invoiceType === "nota_debito") {
      return c.document_type === "RUC";
    }
    return true;
  }), [clients, invoiceType]);

  const branchAwareProducts = useMemo(() => products.map(p => {
    if (branchId === "all") return p;
    return { ...p, stock: getBranchStock(branchStocks, branchId, p.id, branches) };
  }), [products, branchStocks, branchId, branches]);

  const addItem = () => {
    const product = branchAwareProducts.find((p) => p.id === selectedProductId);
    if (!product) return;

    if (product.stock <= 0) {
      showError(`${product.name} está agotado`);
      return;
    }

    const existing = watchedItems.find((i) => i.productId === product.id);
    if (existing) {
      const newQty = existing.quantity + 1;
      if (newQty > product.stock) {
        showError(`Stock insuficiente. Solo hay ${product.stock} unidades disponibles de ${product.name}`);
        return;
      }
      const idx = watchedItems.findIndex((i) => i.productId === product.id);
      setValue(`items.${idx}.quantity`, newQty);
    } else {
      append({ productId: product.id, productName: product.name, quantity: 1, unitPriceSoles: product.price_cents / 100, discount: 0 });
    }
    setSelectedProductId("");
  };

  const formItems: InvoiceItemFormData[] = useMemo(() => watchedItems.map((item) => ({
    product_id: item.productId,
    product_name: item.productName,
    quantity: item.quantity,
    unit_price_cents: toCents(item.unitPriceSoles) as Cents,
    discount_percent: item.discount,
    tax_affectation: (products.find(p => p.id === item.productId)?.tax_affectation || "gravado") as TaxAffectation,
  })), [watchedItems, products]);

  const calc = useMemo(() => formItems.length > 0 ? calculateInvoice(formItems) : null, [formItems]);

  const handleLookupClient = async (data: LookupResult) => {
    const currentType = invoiceTypeRef.current;
    const needsRUC = currentType === "factura" || currentType === "nota_credito" || currentType === "nota_debito";
    if (needsRUC && data.documentType !== "RUC") {
      showError("Este comprobante requiere cliente con RUC.");
      return;
    }
    if (!needsRUC && currentType === "boleta" && data.documentType !== "DNI") {
      showError("La boleta requiere cliente con DNI.");
      return;
    }

    const existing = availableClients.find(c => c.document_number === data.documentNumber);
    if (existing) {
      setValue("clientId", existing.id);
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
        department_code: "",
        province_code: "",
        district_code: "",
      }, null);
      if (created && (created as { id: string }).id) {
        setValue("clientId", (created as { id: string }).id);
      }
    } catch (err) {
      const msg = (err as Error).message || "";
      if (msg.includes("Ya existe") || msg.includes("duplicate")) {
        const existing = await customerService.findByDocument(data.documentNumber);
        if (existing) {
          setValue("clientId", existing.id);
          showSuccess("Cliente encontrado y seleccionado");
          return;
        }
      }
      showError("Error al registrar cliente.");
    }
  };

  const lookupMode = invoiceType === "factura" || invoiceType === "nota_credito" || invoiceType === "nota_debito"
    ? "RUC"
    : "DNI";

  const handleTypeChange = (type: InvoiceType) => {
    setValue("invoiceType", type);
    setValue("clientId", "");
  };

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: CreateInvoiceFormValues) => {
      const client = clients.find((c) => c.id === data.clientId);
      if (!client || !calc || calc.items.length === 0 || !activeBranch) return;

      const rpcItems: InvoiceItemFormData[] = calc.items.map((item) => ({
        product_id: item.product_id || undefined,
        product_name: item.product_name,
        product_sku: products.find((p) => p.id === item.product_id)?.sku || undefined,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
        discount_percent: item.discount_percent,
        tax_affectation: item.tax_affectation,
      }));

      const result = await invoiceService.createWithItems(
        {
          customer_id: client.id,
          invoice_type: data.invoiceType,
          issue_date: new Date().toISOString().split("T")[0],
          items: rpcItems,
        },
        activeBranch.id,
        null,
        null,
        null,
        "admin_manual",
      );
      const invoiceNumber = formatInvoiceNumber(result.serie, result.correlativo);
      showSuccess(`${INVOICE_TYPES[invoiceTypeRef.current].label} ${invoiceNumber} emitida`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.movements.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.branches.allStock });
      navigate("/admin/invoices");
    },
    onError: (err) => {
      const isStockError = err.message?.includes("Stock insuficiente");
      if (isStockError) {
        queryClient.invalidateQueries({ queryKey: queryKeys.branches.allStock });
        queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
        showError(`No se pudo emitir: ${err.message}. El stock se ha actualizado, intenta nuevamente.`);
      } else {
        showError("Error al emitir comprobante: " + err.message);
      }
    },
  });

  const handleSave = handleSubmit((data) => {
    const client = clients.find((c) => c.id === data.clientId);
    if (!client || !calc || calc.items.length === 0) return;
    if (!canSell) {
      if (isWarehouse) {
        showError("Los almacenes no están habilitados para emitir comprobantes. Selecciona un Punto de Venta o Tienda Virtual.");
      } else {
        showError("Selecciona una sede para emitir el comprobante");
      }
      return;
    }

    if (data.invoiceType === "boleta" && calc && calc.total_cents > 70000) {
      if (!client.document_number || client.document_number === "00000000") {
        showError("Boletas mayores a S/ 700.00 deben identificar al cliente. Selecciona un cliente con DNI.");
        return;
      }
    }

    for (const item of data.items) {
      const currentStock = branchId === "all"
        ? products.find(p => p.id === item.productId)?.stock ?? 0
        : getBranchStock(branchStocks, branchId, item.productId, branches);
      if (item.quantity > currentStock) {
        showError(`Stock insuficiente para ${item.productName}. Disponible: ${currentStock}, solicitado: ${item.quantity}`);
        return;
      }
    }

    createInvoiceMutation.mutate(data);
  });

  if (branchesLoading || productsLoading || clientsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-orange-600" />
          <p className="text-sm text-muted-foreground">Cargando datos...</p>
        </div>
      </div>
    );
  }

  if (!activeBranch || isWarehouse) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/invoices")} className="rounded-xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold">Nuevo Comprobante</h1>
        </div>
        <div className={`p-8 rounded-2xl flex items-center gap-4 ${isWarehouse ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800" : "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"}`}>
          {isWarehouse ? (
            <Warehouse className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          )}
          <div>
            <p className={`text-sm font-medium ${isWarehouse ? "text-blue-800 dark:text-blue-300" : "text-amber-700 dark:text-amber-300"}`}>
              {isWarehouse ? "Los almacenes no emiten comprobantes de pago" : "Selecciona una sede para emitir comprobantes"}
            </p>
            <p className={`text-xs mt-0.5 ${isWarehouse ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`}>
              {isWarehouse ? "Los comprobantes se emiten desde Puntos de Venta o Tienda Virtual." : "Usa el selector de sede en la barra superior."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/invoices")} className="rounded-xl">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-bold">Nuevo Comprobante</h1>
          <HelpHint {...HELP_TEXTS.createInvoice} />
        </div>
        <p className="text-sm text-muted-foreground">{nextNumber} · {activeBranch.name}</p>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Tipo de Comprobante *</Label>
              <Select value={invoiceType} onValueChange={(v) => handleTypeChange(v as InvoiceType)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INVOICE_TYPES).map(([key, info]) => (
                    <SelectItem key={key} value={key}>{info.label} ({info.serie_prefix}...)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{INVOICE_TYPES[invoiceType]?.description}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Cliente *</Label>
              <Select value={clientId} onValueChange={(v) => setValue("clientId", v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger>
                <SelectContent>
                  {availableClients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} — {c.document_type}: {c.document_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.clientId && <p className="text-xs text-red-500">{errors.clientId.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Search className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              Consulta rápida por documento
            </Label>
            <CustomerLookup
              key={lookupMode}
              mode={lookupMode}
              onResult={handleLookupClient}
              placeholder={
                lookupMode === "RUC"
                  ? "Escribe un RUC (11 dígitos) para buscar en SUNAT..."
                  : "Escribe un DNI (8 dígitos) para buscar en RENIEC..."
              }
            />
            <p className="text-xs text-muted-foreground">
              Se buscará en {lookupMode === "RUC" ? "SUNAT" : "RENIEC"} y se creará el cliente automáticamente si no existe.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <InvoiceItemEditor
            fields={fields}
            register={register}
            remove={remove}
            watchedItems={watchedItems}
            calc={calc}
            products={branchAwareProducts}
            branchStocks={branchStocks}
            branches={branches}
            branchId={branchId}
            selectedProductId={selectedProductId}
            onSelectedProductIdChange={setSelectedProductId}
            onAddItem={addItem}
            itemsError={errors.items?.message}
          />
          {calc && calc.items.length > 0 && <InvoiceCalcTotals calc={calc} />}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/admin/invoices")} className="rounded-xl">Cancelar</Button>
        <Button onClick={handleSave} disabled={!clientId || fields.length === 0} className="rounded-xl bg-orange-600 hover:bg-orange-700">
          Emitir {INVOICE_TYPES[invoiceType]?.label}
        </Button>
      </div>
    </div>
  );
}
