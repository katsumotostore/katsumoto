import { useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, RefreshCw } from "lucide-react";
import type { Product } from "@/lib/types";
import type { BarcodeConflict } from "@/lib/product-labels";
import { isValidEAN13 } from "@/lib/barcode";
import { productService } from "@/services/product.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Props {
  product: Product;
  conflicts: BarcodeConflict[];
  products: Product[];
  onBack: () => void;
  onSaved: (product: Product) => void;
  onBusy: (value: boolean) => void;
  onRefresh: () => void;
}

export function BarcodeRepairPanel({ product, conflicts, products, onBack, onSaved, onBusy, onRefresh }: Props) {
  const [source, setSource] = useState<"internal" | "manufacturer">("internal");
  const [code, setCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const hasOldCode = !!product.barcode?.trim();
  const sameCode = code === product.barcode;
  const usedCode = products.some(p => p.id !== product.id && p.barcode === code);
  const valid = source === "internal" || (isValidEAN13(code) && !sameCode && !usedCode);
  const validation = !code ? "" : sameCode ? "Es el mismo codigo que tiene este producto." : usedCode ? "Este codigo pertenece a otro producto." : !isValidEAN13(code) ? "Debe tener 13 digitos y un digito verificador valido." : "";

  async function save() {
    if (!valid || (hasOldCode && !confirmed) || pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const updated = await productService.repairBarcode(product, source === "internal" ? null : code);
      onSaved(updated);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar el codigo. Revisa el producto antes de reintentar.");
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  return <>
    <DialogHeader className="px-5 pt-5 pb-3 text-left">
      <DialogTitle>{step === "confirm" ? "Confirmar cambio de codigo" : hasOldCode ? "Reparar codigo de barras" : "Asignar codigo de barras"}</DialogTitle>
      <DialogDescription className="break-words">{product.name} · {product.sku}</DialogDescription>
    </DialogHeader>
    <div className="px-5 pb-5 overflow-y-auto min-h-0 space-y-5">
      <div className="border-y py-3">
        <p className="text-xs text-muted-foreground">Codigo actual</p>
        <p className="font-mono text-base break-all mt-1">{product.barcode || "Sin codigo"}</p>
        {conflicts.length > 0 ? <>
          <p className="text-sm text-red-600 mt-3">Compartido con {conflicts.length} {conflicts.length === 1 ? "producto" : "productos"}:</p>
          <ul className="mt-2 space-y-1 text-sm">
            {conflicts.map(c => <li key={c.other_id} className="break-words">{c.other_name} · {c.other_sku}{!c.other_active && " (archivado)"}</li>)}
          </ul>
          <p className="text-xs text-muted-foreground mt-2">Estos productos conservaran su codigo. Solo cambiara {product.sku}.</p>
        </> : hasOldCode && !isValidEAN13(product.barcode) ? <p className="mt-2 text-sm text-red-600">El codigo actual no es un EAN-13 valido.</p> : null}
      </div>
      {step === "edit" ? <fieldset className="space-y-3">
        <legend className="text-sm font-semibold mb-2">Nuevo codigo</legend>
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input type="radio" name="barcode-source" value="internal" autoFocus checked={source === "internal"} onChange={() => { setSource("internal"); setError(""); }} />
          Asignar un codigo interno nuevo
        </label>
        <label className="flex items-center gap-3 text-sm cursor-pointer">
          <input type="radio" name="barcode-source" value="manufacturer" checked={source === "manufacturer"} onChange={() => { setSource("manufacturer"); setError(""); }} />
          Usar codigo del fabricante (EAN-13)
        </label>
        {source === "manufacturer" && <div className="space-y-2">
          <label htmlFor="manufacturer-barcode" className="text-xs font-medium">Codigo del fabricante</label>
          <Input id="manufacturer-barcode" value={code} inputMode="numeric" autoComplete="off" maxLength={64}
            aria-invalid={!!validation} aria-describedby={validation ? "barcode-validation" : undefined}
            onChange={e => { setCode(e.target.value.replace(/\s/g, "")); setError(""); }} className="font-mono" />
          {validation && <p id="barcode-validation" role="alert" className="text-sm text-red-600">{validation}</p>}
        </div>}
      </fieldset> : <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground">Reemplazo</p>
          <p className="font-semibold break-all mt-1">{source === "internal" ? "Nuevo codigo interno, asignado al guardar" : code}</p>
        </div>
        {hasOldCode && <label className="flex items-start gap-3 text-sm leading-relaxed">
          <Checkbox checked={confirmed} disabled={busy} onCheckedChange={value => setConfirmed(value === true)} className="mt-1 shrink-0" />
          Reemplazare las etiquetas anteriores de este producto por las del nuevo codigo.
        </label>}
      </div>}
      {error && <div role="alert" className="space-y-2">
        <p className="text-sm text-red-600 break-words">{error}</p>
        <Button variant="outline" size="sm" disabled={busy} onClick={onRefresh}><RefreshCw className="h-4 w-4 mr-2" />Volver y actualizar</Button>
      </div>}
    </div>
    <div className="p-5 border-t flex flex-col-reverse sm:flex-row justify-between gap-2">
      <Button variant="outline" disabled={busy} onClick={() => { if (step === "confirm") { setStep("edit"); setConfirmed(false); } else onBack(); }}>
        <ArrowLeft className="h-4 w-4 mr-2" />{step === "confirm" ? "Modificar codigo" : "Volver a etiquetas"}
      </Button>
      <Button disabled={!valid || busy || (step === "confirm" && hasOldCode && !confirmed)}
        onClick={() => step === "edit" ? setStep("confirm") : void save()}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : step === "confirm" ? <Check className="h-4 w-4 mr-2" /> : null}
        {busy ? "Guardando..." : step === "edit" ? "Revisar cambio" : "Confirmar y guardar codigo"}
      </Button>
    </div>
  </>;
}
