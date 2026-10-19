import { useState } from "react";
import { useProducts } from "@/hooks/useProducts";
import { useBranches } from "@/hooks/useBranches";
import { useStockMovements } from "@/hooks/useStockMovements";
import { formatCents } from "@/lib/format";
import { TAX_AFFECTATION_TYPES } from "@/lib/constants";
import { BarcodeDisplay } from "./BarcodeDisplay";
import { ProductKardex } from "./ProductKardex";
import { ProductImage } from "@/components/ProductImage";
import { ProductOverviewTab } from "./ProductOverviewTab";
import { ProductStockTab } from "./ProductStockTab";
import { ProductMachinesTab } from "./ProductMachinesTab";
import { ProductMovementsTab } from "./ProductMovementsTab";
import { PrintLabelsDialog } from "./PrintLabelsDialog";
import { barcodeStatus } from "@/lib/product-labels";
import type { Product } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowUpDown, Pencil, FileText,
  DollarSign, Warehouse, BarChart3, Cog, Activity,
  Tag, Boxes, Barcode,
} from "lucide-react";

interface ProductDetailDialogProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onEdit: (product: Product) => void;
  onAdjustStock: (product: Product) => void;
}

export function ProductDetailDialog({ product: selectedProduct, open, onClose, onEdit, onAdjustStock }: ProductDetailDialogProps) {
  const { products, productMachines, machineModels } = useProducts();
  const { branches, branchStocks } = useBranches();
  const { movements: allMovements } = useStockMovements();
  const [kardexOpen, setKardexOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);

  const latestBarcode = products.find(p => p.id === selectedProduct?.id)?.barcode;
  const product = selectedProduct ? { ...selectedProduct, barcode: latestBarcode ?? selectedProduct.barcode } : null;
  if (!product) return null;

  const labelStatus = barcodeStatus(products.find(p => p.id === product.id) || product, products);

  const machines = productMachines
    .filter(pm => pm.product_id === product.id)
    .map(pm => machineModels.find(m => m.id === pm.machine_model_id))
    .filter(Boolean) as (typeof machineModels)[number][];

  const movements = allMovements
    .filter(m => m.product_id === product.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const getBranchName = (id: string) => branches.find(b => b.id === id)?.name || "—";

  const isLow = product.stock > 0 && product.stock <= product.min_stock;
  const isOut = product.stock === 0;
  const stockPercent = product.max_stock > 0 ? Math.min(100, (product.stock / product.max_stock) * 100) : 0;
  const margin = product.cost_cents > 0 && product.price_cents > 0
    ? ((1 - product.cost_cents / product.price_cents) * 100).toFixed(1)
    : null;
  const taxInfo = TAX_AFFECTATION_TYPES[product.tax_affectation || "gravado"];
  const totalValue = product.price_cents * product.stock;
  const costValue = product.cost_cents * product.stock;

  const activeBranches = branches.filter(b => b.is_active);
  const branchStockData = activeBranches.map(branch => {
    const isMirror = !!branch.stock_source_branch_id;
    const resolvedId = isMirror ? branch.stock_source_branch_id! : branch.id;
    const bs = branchStocks.find(s => s.branch_id === resolvedId && s.product_id === product.id);
    const sourceBranchName = isMirror ? branches.find(b => b.id === branch.stock_source_branch_id)?.name || "" : "";
    return {
      branch,
      stock: bs?.stock ?? 0,
      minStock: bs?.min_stock ?? 0,
      maxStock: bs?.max_stock ?? 0,
      isMirror,
      sourceBranchName,
    };
  });

  const stockStatus = isOut
    ? { label: "Agotado", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800", barColor: "bg-red-400" }
    : isLow
    ? { label: "Stock Bajo", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-800", barColor: "bg-amber-400" }
    : { label: "Disponible", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800", barColor: "bg-emerald-400" };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl rounded-2xl p-0 overflow-hidden">
          <div className="relative bg-gradient-to-r from-emerald-700 to-emerald-800">
            <div className="flex items-start gap-5 p-6">
              <div className="w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 ring-2 ring-white/20 shadow-lg">
                <ProductImage src={product.image_url} name={product.name} className="w-full h-full" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white leading-tight mb-2">{product.name}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/20 rounded-lg text-xs font-mono">{product.sku}</Badge>
                  <Badge className={`${stockStatus.bg} ${stockStatus.color} border rounded-lg text-xs font-semibold`}>{stockStatus.label}</Badge>
                  <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/20 rounded-lg text-xs">{product.category}</Badge>
                  {product.tags && product.tags.length > 0 && product.tags.map((tag) => (
                    <Badge key={tag} className="bg-orange-500/30 text-orange-100 border-orange-400/30 hover:bg-orange-500/40 rounded-lg text-[10px]">{tag}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 flex-shrink-0 hidden sm:flex">
                <div className="bg-white/10 rounded-xl p-2">
                  <BarcodeDisplay code={product.barcode} width={100} height={36} showNumber={false} />
                </div>
                <span className="text-[9px] font-mono text-emerald-200">{product.barcode}</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 px-6 pb-5">
              <div className="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
                <DollarSign className="w-4 h-4 mx-auto mb-1 text-emerald-200" />
                <p className="text-lg font-bold text-white">{formatCents(product.price_cents)}</p>
                <p className="text-[10px] text-emerald-200">Precio</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
                <Tag className="w-4 h-4 mx-auto mb-1 text-emerald-200" />
                <p className="text-lg font-bold text-white">{formatCents(product.cost_cents ?? 0)}</p>
                <p className="text-[10px] text-emerald-200">Costo {margin ? `(${margin}%)` : ""}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
                <Boxes className="w-4 h-4 mx-auto mb-1 text-emerald-200" />
                <p className="text-lg font-bold text-white">{product.stock}</p>
                <p className="text-[10px] text-emerald-200">Stock ({product.unit})</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
                <BarChart3 className="w-4 h-4 mx-auto mb-1 text-emerald-200" />
                <p className="text-lg font-bold text-white">{formatCents(totalValue)}</p>
                <p className="text-[10px] text-emerald-200">Valor total</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-3 border-b bg-muted/20 flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs" onClick={() => { onClose(); onEdit(product); }}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" />Editar
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs" onClick={() => { onClose(); onAdjustStock(product); }}>
              <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />Ajustar Stock
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs" onClick={() => setKardexOpen(true)}>
              <FileText className="w-3.5 h-3.5 mr-1.5" />Kardex
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl h-8 text-xs"
              onClick={() => setLabelsOpen(true)}
            >
              <Barcode className="w-3.5 h-3.5 mr-1.5" />
              {labelStatus === "missing" ? "Generar codigo y etiqueta" : labelStatus === "review" ? "Revisar codigo" : "Descargar etiqueta"}
            </Button>
            <div className="ml-auto">
              <Badge variant="outline" className={`rounded-lg text-[10px] border ${taxInfo?.color || "border-border"}`}>
                IGV: {taxInfo?.label || "Gravado"} ({taxInfo?.code || "10"})
              </Badge>
            </div>
          </div>

          <div className="max-h-[50vh] overflow-y-auto">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full rounded-none border-b bg-transparent h-11 p-0 px-6">
                <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none h-11 px-4 text-sm font-medium">General</TabsTrigger>
                <TabsTrigger value="stock" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none h-11 px-4 text-sm font-medium"><Warehouse className="w-3.5 h-3.5 mr-1.5" />Stock por Sede</TabsTrigger>
                <TabsTrigger value="machines" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none h-11 px-4 text-sm font-medium"><Cog className="w-3.5 h-3.5 mr-1.5" />Máquinas ({machines.length})</TabsTrigger>
                <TabsTrigger value="movements" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none h-11 px-4 text-sm font-medium"><Activity className="w-3.5 h-3.5 mr-1.5" />Movimientos</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-0">
                <ProductOverviewTab product={product} stockStatus={stockStatus} stockPercent={stockPercent} margin={margin} totalValue={totalValue} costValue={costValue} />
              </TabsContent>
              <TabsContent value="stock" className="mt-0">
                <ProductStockTab product={product} branchStocks={branchStockData} activeBranches={activeBranches} />
              </TabsContent>
              <TabsContent value="machines" className="mt-0">
                <ProductMachinesTab machines={machines} />
              </TabsContent>
              <TabsContent value="movements" className="mt-0">
                <ProductMovementsTab movements={movements} getBranchName={getBranchName} />
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <ProductKardex product={product} open={kardexOpen} onClose={() => setKardexOpen(false)} />
      <PrintLabelsDialog open={labelsOpen} onClose={() => setLabelsOpen(false)} preselectedIds={[product.id]} />
    </>
  );
}
