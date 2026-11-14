import { useId, useState } from "react";
import { Pencil } from "lucide-react";
import type { Cents } from "@/lib/types";
import { parseServicePrice } from "@/lib/pos-pricing";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { CartItem } from "./PosCart";

export function ServicePriceEditor({ item, disabled, onChange }: {
  item: CartItem;
  disabled: boolean;
  onChange: (productId: string, price: Cents | null) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const price = parseServicePrice(value);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) setValue((item.effectivePriceCents / 100).toFixed(2)); setOpen(next); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="mt-2 h-8 text-xs" aria-label={`Editar precio de ${item.product.name}`}>
          <Pencil className="mr-1 h-3 w-3" />{item.manualPriceCents !== undefined ? "Precio personalizado" : "Editar precio"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Precio del servicio</DialogTitle>
          <DialogDescription>{item.product.name}. El importe se aplica únicamente a esta venta.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (price === null || disabled) return; onChange(item.product.id, price); setOpen(false); }}>
          <div className="space-y-2">
            <Label htmlFor={id}>Precio unitario (S/)</Label>
            <Input id={id} autoFocus inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} aria-invalid={price === null} aria-describedby={`${id}-help`} />
            <p id={`${id}-help`} className={`text-sm ${price === null ? "text-destructive" : "text-muted-foreground"}`}>
              {price === null ? "Ingresa un importe mayor a cero, con hasta dos decimales." : "Precio final por unidad, con los impuestos que correspondan incluidos."}
            </p>
          </div>
          {price !== null && <p className="font-semibold">{item.quantity} × {formatCents(price)} = {formatCents(price * item.quantity)}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {item.manualPriceCents !== undefined && <Button type="button" variant="outline" disabled={disabled} onClick={() => { onChange(item.product.id, null); setOpen(false); }}>Restaurar precio</Button>}
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={price === null || disabled}>Aplicar precio</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
