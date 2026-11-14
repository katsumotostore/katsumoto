import { ServicePriceEditor } from "./ServicePriceEditor";
import { useRef, useMemo, memo } from "react";
import type { Product, InvoiceType, Customer, Cents } from "@/lib/types";
import type { InvoiceCalculation } from "@/lib/calculations";
import { formatCents } from "@/lib/format";
import { IGV_RATE, TAX_AFFECTATION_TYPES } from "@/lib/constants";
import { ProductImage } from "@/components/ProductImage";
import { CustomerLookup, type LookupResult } from "@/components/CustomerLookup";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Minus, Plus, Trash2, ShoppingCart, CreditCard, Receipt, Sparkles, Tag, Wallet } from "lucide-react";

export interface CartItem {
  product: Product;
  quantity: number;
  effectivePriceCents: Cents;
  manualPriceCents?: Cents;
  appliedTierLabel?: string;
  isTierPrice?: boolean;
  savingsCents?: Cents;
}

interface PosCartProps {
  cart: CartItem[];
  calc: InvoiceCalculation | null;
  invoiceType: InvoiceType;
  clientId: string;
  clients: Customer[];
  onUpdateQty: (productId: string, delta: number) => void;
  onUpdateServicePrice: (productId: string, price: Cents | null) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onCobrar: () => void;
  onChangeType: (type: InvoiceType) => void;
  onChangeClient: (id: string) => void;
  onCreateClient: (data: LookupResult) => void;
  canSell?: boolean;
}

export const PosCart = memo(function PosCart({
  cart,
  calc,
  invoiceType,
  clientId,
  clients,
  onUpdateQty,
  onUpdateServicePrice,
  onRemove,
  onClear,
  onCobrar,
  onChangeType,
  onChangeClient,
  onCreateClient,
  canSell = true,
}: PosCartProps) {
  // Ref to validate stale async results against current invoice type
  const invoiceTypeRef = useRef(invoiceType);
  invoiceTypeRef.current = invoiceType;

  const filteredClients = useMemo(
    () =>
      invoiceType === "factura"
        ? clients.filter((c) => c.document_type === "RUC")
        : clients,
    [invoiceType, clients]
  );

  const totalSavings = useMemo(
    () =>
      cart.reduce(
        (s, i) => s + (i.savingsCents ? i.savingsCents * i.quantity : 0) as Cents,
        0 as Cents
      ),
    [cart]
  );

  const handleLookupResult = (data: LookupResult) => {
    // Reject stale results: if we switched modes, ignore old results
    const currentType = invoiceTypeRef.current;
    if (currentType === "factura" && data.documentType !== "RUC") return;
    if (currentType === "boleta" && data.documentType !== "DNI") return;

    const existing = clients.find(
      (c) => c.document_number === data.documentNumber,
    );
    if (existing) {
      onChangeClient(existing.id);
    } else {
      onCreateClient(data);
    }
  };

  // Boleta → solo DNI, Factura → solo RUC
  const lookupMode = invoiceType === "factura" ? "RUC" : "DNI";

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
      {/* Header */}
      <div className="px-3 py-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-bold">Orden</span>
            {cart.length > 0 && (
              <span className="text-xs text-slate-400">({cart.length})</span>
            )}
          </div>
          {cart.length > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors font-medium"
            >
              Limpiar
            </button>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-0.5">
            <button
              onClick={() => onChangeType("boleta")}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                invoiceType === "boleta"
                  ? "bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Receipt className="w-3 h-3" />
              Boleta
            </button>
            <button
              onClick={() => onChangeType("factura")}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                invoiceType === "factura"
                  ? "bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Receipt className="w-3 h-3" />
              Factura
            </button>
          </div>

          {/* Customer Lookup — key forza remontaje al cambiar modo */}
          <CustomerLookup
            key={lookupMode}
            mode={lookupMode}
            onResult={handleLookupResult}
            compact
            placeholder={
              invoiceType === "factura"
                ? "Consultar RUC (11 dígitos)..."
                : "Consultar DNI (8 dígitos)..."
            }
          />

          <Select value={clientId} onValueChange={onChangeClient}>
            <SelectTrigger className="w-full h-8 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
              <SelectValue
                placeholder={
                  invoiceType === "factura"
                    ? "Buscar RUC *"
                    : "Cliente"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {invoiceType === "boleta" && (
                <SelectItem value="none">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Sparkles className="w-3 h-3" />
                    Consumidor Final
                  </span>
                </SelectItem>
              )}
              {filteredClients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="text-xs truncate">{c.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {invoiceType === "factura" && clientId === "none" && (
            <p className="text-[11px] text-amber-500">
              Selecciona cliente con RUC
            </p>
          )}
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-auto px-3 py-2 space-y-2">
        {cart.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-900 rounded-xl flex items-center justify-center mx-auto mb-3 border border-slate-200 dark:border-slate-800">
              <ShoppingCart className="w-7 h-7 text-slate-300 dark:text-slate-700" />
            </div>
            <p className="text-sm font-medium text-slate-400">
              Sin productos
            </p>
            <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">
              Toca un producto para agregar
            </p>
          </div>
        ) : (
          cart.map((item) => {
            const taxType = item.product.tax_affectation || "gravado";
            const taxInfo = TAX_AFFECTATION_TYPES[taxType];
            return (
              <div
                key={item.product.id}
                className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2.5 border border-slate-200/60 dark:border-slate-800/60"
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                    <ProductImage
                      src={item.product.image_url}
                      name={item.product.name}
                      className="w-full h-full"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight line-clamp-2">
                        {item.product.name}
                      </p>
                      <button
                        onClick={() => onRemove(item.product.id)}
                        className="p-1 hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 hover:text-red-500" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[11px] text-slate-400 font-mono">
                        {formatCents(item.effectivePriceCents)} c/u
                      </span>
                      {taxInfo && (
                        <span
                          className={`inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold border ${taxInfo.color}`}
                        >
                          {taxInfo.label} {taxInfo.rate}
                        </span>
                      )}
                      {item.isTierPrice && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-500">
                          <Tag className="w-2.5 h-2.5" />
                          {item.appliedTierLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {item.product.product_family === "servicios" && (
                  <div className="ml-[50px]">
                    <ServicePriceEditor item={item} disabled={!canSell} onChange={onUpdateServicePrice} />
                  </div>
                )}
                <div className="flex items-center justify-between mt-2 ml-[50px]">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onUpdateQty(item.product.id, -1)}
                      className="w-7 h-7 rounded-md bg-slate-200/60 dark:bg-slate-800 flex items-center justify-center hover:bg-red-500/15 transition-colors"
                    >
                      <Minus className="w-3 h-3 text-slate-500" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQty(item.product.id, 1)}
                      disabled={item.quantity >= item.product.stock}
                      className="w-7 h-7 rounded-md bg-slate-200/60 dark:bg-slate-800 flex items-center justify-center hover:bg-orange-500/15 transition-colors disabled:opacity-30"
                    >
                      <Plus className="w-3 h-3 text-slate-500" />
                    </button>
                  </div>
                  <span className="text-sm font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                    {formatCents(item.effectivePriceCents * item.quantity)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Totals & Charge */}
      {calc && cart.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
          {cart.some((i) => i.isTierPrice && i.savingsCents) && (
            <div className="px-3 pt-3 pb-1">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-500/10 rounded-lg">
                <Tag className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <p className="text-xs text-blue-400 font-medium">
                  Ahorro:{" "}
                  <span className="font-bold">
                    {formatCents(totalSavings)}
                  </span>
                </p>
              </div>
            </div>
          )}
          <div className="px-3 pt-3 pb-1 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Subtotal</span>
              <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                {formatCents(calc.gravada_cents + calc.exonerada_cents + calc.inafecta_cents + calc.exportacion_cents)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">
                IGV {(IGV_RATE * 100).toFixed(0)}%
              </span>
              <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                {formatCents(calc.igv_cents)}
              </span>
            </div>
          </div>
          <div className="px-3 py-3">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-bold">Total</span>
              <span className="text-xl font-bold text-orange-600 dark:text-orange-400 tabular-nums leading-none">
                {formatCents(calc.total_cents)}
              </span>
            </div>
            {!canSell ? (
              <div className="flex items-center justify-center gap-2 h-11 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-400 text-sm font-medium">
                <Wallet className="w-4 h-4" />
                Sin caja abierta
              </div>
            ) : (
              <Button
                onClick={onCobrar}
                disabled={
                  invoiceType === "factura" &&
                  (!clientId || clientId === "none")
                }
                className="w-full h-11 rounded-xl bg-orange-600 hover:bg-orange-500 text-sm font-bold shadow-lg shadow-orange-900/30 text-white border-0 disabled:opacity-40"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Cobrar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});