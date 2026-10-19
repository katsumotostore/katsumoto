import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProducts } from "@/hooks/useProducts";
import { useAuth } from "@/lib/auth-context";
import { ProductImage } from "@/components/ProductImage";
import { barcodeStatus, type BarcodeStatus, type BarcodeConflict } from "@/lib/product-labels";
import { isValidEAN13 } from "@/lib/barcode";
import { BarcodeRepairPanel } from "./BarcodeRepairPanel";
import { queryKeys } from "@/lib/query-keys";
import { productService } from "@/services/product.service";
import { downloadLabels, generateProductLabels } from "@/lib/printing/labels/generate-labels";
import { getSellerInfo } from "@/lib/printing/seller-info";
import { showSuccess, showError } from "@/utils/toast";
import type { Product } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Download, Loader2, Search, Barcode, FileText, Wrench, X, RefreshCw } from "lucide-react";

interface PrintLabelsDialogProps {
  open: boolean;
  onClose: () => void;
  preselectedIds?: string[];
}

const states: Record<BarcodeStatus, string> = { ready: "Con codigo", missing: "Sin codigo", review: "Por revisar" };

export function PrintLabelsDialog({ open, onClose, preselectedIds }: PrintLabelsDialogProps) {
  const { products, isLoading, error: productsError } = useProducts();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const conflictsQuery = useQuery({
    queryKey: queryKeys.products.barcodeConflicts,
    queryFn: productService.barcodeConflicts,
    enabled: open,
    staleTime: 0,
    retry: 1,
  });
  const conflicts = conflictsQuery.data || [];
  const conflictIds = new Set(conflicts.map(c => c.product_id));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | BarcodeStatus>("all");
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"download" | "preview">("download");
  const [repairProduct, setRepairProduct] = useState<Product | null>(null);
  const [notice, setNotice] = useState("");
  const initialKey = (preselectedIds || []).join(",");
  const canAssign = !!user && ["owner", "admin", "inventory"].includes(user.role);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialKey ? initialKey.split(",") : []));
    setQuantities({});
    setSearch("");
    setFilter("all");
    setError("");
    setConfirm(false);
    setRepairProduct(null);
    setNotice("");
  }, [open, initialKey]);

  const statuses = new Map(products.map(p => [p.id, barcodeStatus(p, products, conflictIds.has(p.id))]));
  const eligible = (p: Product) => statuses.get(p.id) === "ready" || (statuses.get(p.id) === "missing" && canAssign);
  const filtered = products.filter(p => {
    const q = search.trim().toLowerCase();
    return (filter === "all" || statuses.get(p.id) === filter) &&
      (!q || [p.name, p.sku, p.barcode || ""].some(value => value.toLowerCase().includes(q)));
  });
  const selectable = filtered.filter(eligible);
  const allSelected = selectable.length > 0 && selectable.every(p => selected.has(p.id));
  const someSelected = selectable.some(p => selected.has(p.id));
  const chosen = products.filter(p => selected.has(p.id));
  const missing = chosen.filter(p => statuses.get(p.id) === "missing").length;
  const total = chosen.reduce((sum, p) => sum + (quantities[p.id] ?? 1), 0);
  const valid = !conflictsQuery.isPending && !conflictsQuery.isError && chosen.length > 0 && chosen.length <= 500 && chosen.every(eligible) &&
    chosen.every(p => Number.isInteger(quantities[p.id] ?? 1) && (quantities[p.id] ?? 1) >= 1 && (quantities[p.id] ?? 1) <= 99) && total <= 5000;

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setError("");
  }

  function repaired(product: Product) {
    queryClient.setQueryData<Product[]>(queryKeys.products.all, current =>
      (current || []).map(p => p.id === product.id ? product : p));
    queryClient.setQueryData<BarcodeConflict[]>(queryKeys.products.barcodeConflicts, current =>
      (current || []).filter(c => c.product_id !== product.id && c.other_id !== product.id));
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.barcodeConflicts });
    setRepairProduct(null);
    setFilter("all");
    setSearch(product.sku);
    setSelected(prev => new Set([...prev, product.id]));
    setError("");
    setNotice(`Codigo guardado para ${product.sku}: ${product.barcode}. Ya puedes descargar su etiqueta.`);
    showSuccess("Codigo guardado");
  }

  async function generate() {
    if (!valid || loading) return;
    const tab = mode === "preview" ? window.open("", "_blank") : null;
    if (mode === "preview" && !tab) {
      setError("El navegador bloqueo la vista previa. Permite ventanas emergentes o descarga el PDF.");
      return;
    }
    setConfirm(false);
    setLoading(true);
    setError("");
    let saved = false;
    try {
      const sellerInfo = await getSellerInfo();
      const prepared = await productService.prepareLabels(chosen.map(p => p.id));
      saved = true;
      queryClient.setQueryData<Product[]>(queryKeys.products.all, current =>
        (current || []).map(p => prepared.find(item => item.id === p.id) || p));
      const byId = new Map(prepared.map(p => [p.id, p]));
      const ordered = chosen.map(p => byId.get(p.id)!);
      const options = { sellerInfo, products: ordered, copiesByProduct: quantities };
      if (mode === "download") downloadLabels(options);
      else if (tab) {
        const url = URL.createObjectURL(generateProductLabels(options).output("blob"));
        tab.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      showSuccess(`${total} etiquetas generadas`);
    } catch (failure) {
      tab?.close();
      const reason = failure instanceof Error ? failure.message : "No se pudo preparar el PDF.";
      const message = saved ? `Los codigos ya estan guardados. Reintenta el PDF. ${reason}` : reason;
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }

  return <>
    <Dialog open={open} onOpenChange={value => { if (!value && !loading) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] flex flex-col gap-0 p-0 overflow-hidden rounded-lg">
        {repairProduct ? <BarcodeRepairPanel key={repairProduct.id} product={repairProduct}
          conflicts={conflicts.filter(c => c.product_id === repairProduct.id)} products={products}
          onBack={() => setRepairProduct(null)} onSaved={repaired} onBusy={setLoading}
          onRefresh={() => {
            setRepairProduct(null);
            void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
          }} /> : <>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2"><Barcode className="h-5 w-5" />Imprimir etiquetas</DialogTitle>
          <DialogDescription>A4 · 24 etiquetas por hoja · 63 x 33,9 mm</DialogDescription>
        </DialogHeader>
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Buscar productos para etiquetas" placeholder="Nombre, SKU o codigo" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Estado del codigo">
            {(["all", "ready", "missing", "review"] as const).map(value => <button key={value} aria-pressed={filter === value}
              onClick={() => setFilter(value)} className={`px-3 py-2 text-xs border-b-2 ${filter === value ? "border-foreground font-semibold" : "border-transparent text-muted-foreground"}`}>
              {value === "all" ? "Todos" : states[value]} ({value === "all" ? products.length : products.filter(p => statuses.get(p.id) === value).length})
            </button>)}
          </div>
        </div>
        {notice && <p role="status" className="px-5 pb-3 text-sm break-words">{notice}</p>}
        {conflictsQuery.isError && <div role="alert" className="px-5 pb-3 flex items-center gap-2 text-sm text-red-600">
          <span>No se pudo verificar si hay codigos duplicados.</span>
          <Button variant="outline" size="sm" onClick={() => void conflictsQuery.refetch()}><RefreshCw className="h-4 w-4 mr-1" />Reintentar</Button>
        </div>}
        <div className="px-5 py-2 border-y flex flex-wrap items-center justify-between gap-3 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox disabled={loading || conflictsQuery.isPending || conflictsQuery.isError || selectable.length === 0} checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={() => setSelected(prev => {
                const next = new Set(prev);
                for (const p of selectable) { if (allSelected) next.delete(p.id); else next.add(p.id); }
                return next;
              })} />
            Seleccionar visibles
          </label>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs">{chosen.length} productos · {total} etiquetas</span>
            {chosen.length > 0 && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Limpiar seleccion" title="Limpiar seleccion" disabled={loading} onClick={() => setSelected(new Set())}><X className="h-4 w-4" /></Button>}
          </div>
        </div>
        <div className="overflow-y-auto min-h-0 flex-1 px-5 max-h-[42dvh]">
          {isLoading ? <p className="py-8 text-center">Cargando productos...</p> : productsError ? <p role="alert" className="py-8 text-red-600">No se pudieron cargar los productos.</p> : filtered.length === 0 ? <p className="py-8 text-center text-muted-foreground">Sin productos</p> : filtered.map(p => {
            const status = statuses.get(p.id)!;
            const checked = selected.has(p.id);
            return <div key={p.id} className={`flex items-center gap-3 py-3 border-b ${checked ? "bg-muted/50" : ""}`}>
              <Checkbox aria-label={`Seleccionar ${p.name}`} checked={checked} disabled={loading || conflictsQuery.isPending || conflictsQuery.isError || (!eligible(p) && !checked)} onCheckedChange={() => toggle(p.id)} />
              <ProductImage src={p.image_url} name={p.name} className="h-9 w-9 object-cover rounded shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium break-words">{p.name}</p>
                <p className="text-xs text-muted-foreground break-all">{p.sku} · {p.barcode || "Sin codigo"}</p>
                <p className={`text-xs mt-1 ${status === "review" ? "text-red-600" : "text-muted-foreground"}`}>
                  {status === "review" ? !isValidEAN13(p.barcode) ? "Codigo EAN-13 invalido" : "Codigo compartido con otro producto" : status === "missing" && !canAssign ? "Requiere administrador o inventario" : states[status]}
                </p>
                {status !== "ready" && canAssign && <Button variant="outline" size="sm" disabled={loading || conflictsQuery.isPending || conflictsQuery.isError}
                  className="mt-2 h-8 text-xs" aria-label={`${status === "review" ? "Reparar" : "Asignar codigo a"} ${p.name}`}
                  onClick={() => { setError(""); setRepairProduct(p); }}>
                  <Wrench className="h-3.5 w-3.5 mr-1.5" />{status === "review" ? "Reparar codigo" : "Asignar codigo"}
                </Button>}
                {status === "review" && !canAssign && <p className="text-xs text-muted-foreground mt-1">Requiere administrador o inventario.</p>}
              </div>
              <div className="w-16 shrink-0">
                <label htmlFor={`copies-${p.id}`} className="text-[11px] text-muted-foreground">Cantidad</label>
                <Input id={`copies-${p.id}`} aria-label={`Cantidad de etiquetas de ${p.name}`} type="number" min={1} max={99} step={1}
                  disabled={!checked || loading} value={quantities[p.id] ?? 1}
                  aria-invalid={checked && (!Number.isInteger(quantities[p.id] ?? 1) || (quantities[p.id] ?? 1) < 1 || (quantities[p.id] ?? 1) > 99)}
                  onChange={e => setQuantities(prev => ({ ...prev, [p.id]: Number(e.target.value) }))} className="h-8 px-2" />
                {checked && (!Number.isInteger(quantities[p.id] ?? 1) || (quantities[p.id] ?? 1) < 1 || (quantities[p.id] ?? 1) > 99) && <p className="text-xs text-red-600">De 1 a 99</p>}
              </div>
            </div>;
          })}
        </div>
        <div className="p-5 border-t space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{conflictsQuery.isPending ? "Verificando codigos..." : chosen.length === 0 ? "Ningun producto seleccionado" : chosen.some(p => !eligible(p)) ? "Hay codigos pendientes de revision" : missing ? `${missing} ${missing === 1 ? "producto necesita" : "productos necesitan"} codigo` : "Codigos listos para imprimir"}</span>
            <select aria-label="Salida de etiquetas" disabled={loading} value={mode} onChange={e => setMode(e.target.value as typeof mode)} className="bg-background border rounded px-2 py-1">
              <option value="download">Descargar PDF</option><option value="preview">Vista previa</option>
            </select>
          </div>
          {error && <p role="alert" className="text-sm text-red-600 break-words">{error}</p>}
          {(chosen.length > 500 || total > 5000) && <p role="alert" className="text-sm text-red-600">Maximo 500 productos y 5000 etiquetas por archivo.</p>}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cerrar</Button>
            <Button onClick={() => missing ? setConfirm(true) : void generate()} disabled={!valid || loading} className="h-auto min-h-10 whitespace-normal">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" /> : mode === "download" ? <Download className="h-4 w-4 mr-2 shrink-0" /> : <FileText className="h-4 w-4 mr-2 shrink-0" />}
              {loading ? "Preparando..." : missing ? "Generar codigos y PDF" : mode === "download" ? "Descargar etiquetas" : "Abrir PDF"}
            </Button>
          </div>
        </div>
        </>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirm} onOpenChange={setConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Asignar codigos internos</AlertDialogTitle>
          <AlertDialogDescription>Se asignaran codigos a {missing} productos. Los {chosen.length - missing} codigos existentes no se modificaran.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => void generate()}>Confirmar y generar PDF</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
