import { useState, useEffect } from "react";
import { usePosCart } from "@/hooks/usePosCart";
import { usePosInvoice } from "@/hooks/usePosInvoice";
import { useBranches } from "@/hooks/useBranches";
import { useTaxConfig } from "@/lib/tax-config-context";
import { formatCents } from "@/lib/format";
import { PosProductGrid } from "@/components/pos/PosProductGrid";
import { PosCart } from "@/components/pos/PosCart";
import { PosPaymentDialog } from "@/components/pos/PosPaymentDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CreditCard, ShoppingCart, ChevronUp, Warehouse, AlertTriangle, Store, Wallet, Plus, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { HelpHint } from "@/components/HelpHint";
import { HELP_TEXTS } from "@/lib/help-texts";
import type { Customer } from "@/lib/types";

export default function POS() {
  const navigate = useNavigate();
  const { branches, setSelectedBranchId, selectedBranchId } = useBranches();
  const { taxConfig, isLoading: taxLoading } = useTaxConfig();
  const taxConfigMissing = !taxLoading && !taxConfig.sellerProvinceCode;
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    const activeBranches = branches.filter((b) => b.type !== "warehouse" && b.is_active);
    if (activeBranches.length === 1 && selectedBranchId === "all") {
      setSelectedBranchId(activeBranches[0].id);
    }
  }, [branches, selectedBranchId, setSelectedBranchId]);

  const {
    cart, setCart: _setCart, branchProducts, priceTiers, addToCart, updateQty, updateServicePrice, removeFromCart,
    clearCart: clearCartItems, calc, isLoading: cartLoading, error: cartError,
  } = usePosCart(selectedCustomer);

  const {
    invoiceType, clientId, setClientId, paymentOpen, lastInvoiceNumber,
    openRegisterAmount, setOpenRegisterAmount, showOpenRegister, setShowOpenRegister,
    activeBranch, isWarehouse, openRegister, canSell, registerNeedsOpen, clients,
    handleOpenRegister, handleLookupClient, handleInvoiceTypeChange,
    handleCobrar, handleConfirmPayment, isPaymentPending, handlePrintA4, handlePrintTicket, handleClosePayment,
  } = usePosInvoice(cart, calc);

  useEffect(() => {
    const customer = clientId !== "none"
      ? clients.find((c) => c.id === clientId) ?? null
      : null;
    setSelectedCustomer(customer);
  }, [clientId, clients]);

  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const clearCart = () => { clearCartItems(); setClientId("none"); };
  const handleClosePaymentAndCart = () => {
    handleClosePayment();
    if (lastInvoiceNumber) { clearCartItems(); setClientId("none"); }
  };

  if (cartLoading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-orange-600" />
          <p className="text-sm text-muted-foreground">Cargando productos...</p>
        </div>
      </div>
    );
  }

  if (cartError) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <AlertTriangle className="w-10 h-10 text-red-500" />
          <div>
            <h2 className="text-lg font-semibold">Error al cargar productos</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {(cartError as Error)?.message ?? "Ocurrió un error inesperado"}
            </p>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:h-[calc(100vh-5rem)] pb-20 lg:pb-0 -m-4 md:-m-6">
      <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500/15 rounded-lg flex items-center justify-center">
            <Store className="w-4.5 h-4.5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-base font-bold leading-tight">Punto de Venta</h1>
            <HelpHint {...HELP_TEXTS.pos} />
          </div>
          {openRegister && (
            <Badge variant="secondary" className="rounded-lg text-[11px] font-medium gap-1.5 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800">
              <Wallet className="w-3 h-3" />Caja #{openRegister.number}
            </Badge>
          )}
          {activeBranch && canSell && (
            <Badge variant="secondary" className="rounded-lg text-[11px] font-medium gap-1.5 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              {activeBranch.name}
            </Badge>
          )}
          {isWarehouse && (
            <Badge variant="secondary" className="rounded-lg text-[11px] font-medium gap-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
              <Warehouse className="w-3.5 h-3.5" />Solo almacén
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {taxConfigMissing && (
            <Button variant="outline" size="sm" className="rounded-xl text-xs h-8 gap-1.5 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20" onClick={() => navigate("/admin/tax-configuration")}>
              <AlertTriangle className="w-3 h-3" />Config. Tributaria
            </Button>
          )}
          {isWarehouse && (
            <Button variant="outline" size="sm" className="rounded-xl text-xs h-8" onClick={() => navigate("/admin/transfers")}>Transferencias</Button>
          )}
          {openRegister && (
            <Button variant="outline" size="sm" className="rounded-xl text-xs h-8" onClick={() => navigate("/admin/cash-registers")}>Ver Cajas</Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div className="h-full grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-9 overflow-hidden">
            {registerNeedsOpen ? (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center max-w-sm">
                  <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Wallet className="w-8 h-8 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h2 className="text-xl font-bold mb-2">Abrir Caja para Vender</h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    Necesitas abrir una caja en <strong>{activeBranch?.name}</strong> para registrar ventas.
                  </p>
                  {!showOpenRegister ? (
                    <Button onClick={() => setShowOpenRegister(true)} className="rounded-xl bg-orange-600 hover:bg-orange-700 h-11 px-6">
                      <Plus className="w-4 h-4 mr-2" />Abrir Caja
                    </Button>
                  ) : (
                    <div className="space-y-3 bg-card rounded-2xl p-5 border">
                      <p className="text-sm font-semibold">Fondo Inicial (S/.)</p>
                      <Input type="number" value={openRegisterAmount} onChange={(e) => setOpenRegisterAmount(e.target.value)}
                        className="rounded-xl h-12 text-center text-lg font-bold" placeholder="0.00" autoFocus />
                      <div className="flex gap-2">
                        {[1000, 2000, 5000].map((amt) => (
                          <button key={amt} onClick={() => setOpenRegisterAmount(String(amt))}
                            className="flex-1 py-2 rounded-xl border text-xs font-semibold hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
                            S/ {amt.toLocaleString("es-PE")}
                          </button>
                        ))}
                      </div>
                      <Button onClick={handleOpenRegister} disabled={!openRegisterAmount || Number(openRegisterAmount) < 0}
                        className="w-full rounded-xl bg-orange-600 hover:bg-orange-700 h-11">
                        Abrir Caja — S/ {Number(openRegisterAmount || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : canSell ? (
              <PosProductGrid products={branchProducts} priceTiers={priceTiers} onAdd={addToCart} disabled={!canSell} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <AlertTriangle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Selecciona un Punto de Venta para comenzar</p>
                </div>
              </div>
            )}
          </div>

          <div className="hidden lg:flex lg:col-span-3 overflow-hidden border-l border-border">
            <PosCart cart={cart} calc={calc} invoiceType={invoiceType} clientId={clientId}
              clients={clients} onUpdateQty={updateQty} onUpdateServicePrice={updateServicePrice} onRemove={removeFromCart} onClear={clearCart}
              onCobrar={handleCobrar} onChangeType={handleInvoiceTypeChange} onChangeClient={setClientId}
              onCreateClient={handleLookupClient} canSell={canSell} />
          </div>
        </div>
      </div>

      {cart.length > 0 && calc && canSell && (
        <div className="fixed bottom-0 inset-x-0 z-40 lg:hidden">
          {mobileCartOpen && (
            <div className="max-h-[70vh] overflow-auto border-t border-slate-800 bg-slate-950 rounded-t-2xl">
              <PosCart cart={cart} calc={calc} invoiceType={invoiceType} clientId={clientId}
                clients={clients} onUpdateQty={updateQty} onUpdateServicePrice={updateServicePrice} onRemove={removeFromCart} onClear={clearCart}
                onCobrar={handleCobrar} onChangeType={handleInvoiceTypeChange} onChangeClient={setClientId}
                onCreateClient={handleLookupClient} canSell={canSell} />
            </div>
          )}
          <div className="p-3 bg-slate-950/95 backdrop-blur-md border-t border-slate-800">
            <div className="flex items-center justify-between max-w-screen-md mx-auto">
              <button onClick={() => setMobileCartOpen(!mobileCartOpen)} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="relative">
                  <ShoppingCart className="w-5 h-5 text-orange-400" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">{cart.length}</span>
                </div>
                <div className="text-left min-w-0">
                  <p className="text-[10px] text-slate-400">{cart.length} item{cart.length !== 1 ? "s" : ""}</p>
                  <p className="text-base font-bold text-white tabular-nums leading-tight">{formatCents(calc.total_cents)}</p>
                </div>
                <ChevronUp className={`w-4 h-4 text-slate-400 transition-transform ${mobileCartOpen ? "rotate-180" : ""}`} />
              </button>
              <Button className="rounded-xl bg-orange-600 hover:bg-orange-500 font-bold px-5 h-10 text-white border-0 shadow-lg shadow-orange-900/40 text-xs" onClick={handleCobrar}>
                <CreditCard className="w-3.5 h-3.5 mr-1.5" />Cobrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {calc && <PosPaymentDialog open={paymentOpen} totalCents={calc.total_cents} onClose={handleClosePaymentAndCart}
        onConfirm={handleConfirmPayment} isPending={isPaymentPending} lastInvoiceNumber={lastInvoiceNumber}
        onPrintA4={lastInvoiceNumber ? handlePrintA4 : undefined}
        onPrintTicket={lastInvoiceNumber ? handlePrintTicket : undefined} />}
    </div>
  );
}
