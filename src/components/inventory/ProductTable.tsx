import { useManagedCatalog } from "@/hooks/useManagedCatalog";
import { useMemo, memo } from "react";
import { SortableHeader } from "@/components/data-table/SortableHeader";
import { ProductImage } from "@/components/ProductImage";
import { formatCents } from "@/lib/format";
import {
  MACHINE_CATEGORIES,
  TAX_AFFECTATION_TYPES,
} from "@/lib/constants";
import { getGroupInfo } from "@/lib/managed-catalog";
import {
  getMarginBadgeColor,
  getMarginColor,
} from "@/lib/pricing";
import type {
  Product,
  PriceTier,
  ProductMachineModel,
  MachineModel,
} from "@/lib/types";
import type { SortState } from "@/hooks/useTableSort";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Package,
  AlertTriangle,
  Pencil,
  Trash2,
  Cog,
  Eye,
  ArrowUpDown,
  TrendingUp,
  Barcode,
} from "lucide-react";

interface ProductTableProps {
  paginated: Product[];
  sort: SortState<"name" | "sku" | "category" | "price" | "cost" | "stock" | "margin">;
  toggleSort: (column: "name" | "sku" | "category" | "price" | "cost" | "stock" | "margin") => void;
  filtered: Product[];
  priceTiers: PriceTier[];
  productMachines: ProductMachineModel[];
  machineModels: MachineModel[];
  marginMap: Map<string, { min: number; max: number; details: { label: string; min_quantity: number; price_cents: number; margin: number }[] } | null>;
  onViewDetail: (product: Product) => void;
  onAdjustStock: (product: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (productId: string) => void;
  onPrintLabel?: (product: Product) => void;
}

export const ProductTable = memo(function ProductTable({
  paginated,
  sort,
  toggleSort,
  filtered,
  priceTiers,
  productMachines,
  machineModels,
  marginMap,
  onViewDetail,
  onAdjustStock,
  onEdit,
  onDelete,
  onPrintLabel,
}: ProductTableProps) {
  const { all: { groups: catalogGroups } } = useManagedCatalog();
  const productsWithTiers = useMemo(() => new Set(priceTiers.map((t) => t.product_id)), [priceTiers]);

  const machineMap = useMemo(() => {
    const map = new Map<string, MachineModel[]>();
    for (const pm of productMachines) {
      const model = machineModels.find(m => m.id === pm.machine_model_id);
      if (model) {
        const list = map.get(pm.product_id) || [];
        list.push(model);
        map.set(pm.product_id, list);
      }
    }
    return map;
  }, [productMachines, machineModels]);

  const tierCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of priceTiers) {
      map.set(t.product_id, (map.get(t.product_id) || 0) + 1);
    }
    return map;
  }, [priceTiers]);

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <SortableHeader column="name" label="Producto" className="text-left" isActive={sort.column === "name"} direction={sort.direction} onSort={toggleSort} />
                <th className="text-left py-3 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">
                  Grupo
                </th>
                <SortableHeader
                  column="category"
                  label="Categoría"
                  className="text-left hidden md:table-cell"
                  isActive={sort.column === "category"}
                  direction={sort.direction}
                  onSort={toggleSort}
                />
                <th className="text-center py-3 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">
                  Máquinas
                </th>
                <th className="text-center py-3 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  IGV
                </th>
                <SortableHeader column="price" label="Precio" className="text-right" isActive={sort.column === "price"} direction={sort.direction} onSort={toggleSort} />
                <SortableHeader column="margin" label="Margen" className="text-center" isActive={sort.column === "margin"} direction={sort.direction} onSort={toggleSort} />
                <SortableHeader column="stock" label="Stock" className="text-center" isActive={sort.column === "stock"} direction={sort.direction} onSort={toggleSort} />
                <th className="text-center py-3 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-[120px]">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((product) => {
                const isLow = product.stock > 0 && product.stock <= product.min_stock;
                const isOut = product.stock === 0;
                const isOverMax = product.stock > product.max_stock;
                const machines = machineMap.get(product.id) || [];
                const taxInfo = TAX_AFFECTATION_TYPES[product.tax_affectation || "gravado"];
                const stockPercent =
                  product.max_stock > 0
                    ? Math.min(100, (product.stock / product.max_stock) * 100)
                    : 0;
                const grpInfo = getGroupInfo(product.category_group, catalogGroups);
                const marginInfo = marginMap.get(product.id);
                const hasTiers = productsWithTiers.has(product.id);
                const tierCount = tierCountMap.get(product.id) || 0;

                return (
                  <tr
                    key={product.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border border-border/50">
                          <ProductImage
                            src={product.image_url}
                            name={product.name}
                            className="w-full h-full"
                          />
                        </div>
                        <div className="min-w-0">
                          <button
                            onClick={() => onViewDetail(product)}
                            className="font-medium text-sm truncate max-w-[240px] text-left hover:text-orange-600 dark:hover:text-orange-400 hover:underline transition-colors"
                          >
                            {product.name}
                          </button>
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] text-muted-foreground font-mono">
                              {product.sku}
                            </p>
                            <span className="text-[10px] text-muted-foreground font-mono hidden xl:inline">
                              {" "}
                              {"·"} {product.barcode}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      {grpInfo && (
                        <Badge
                          variant="secondary"
                          className={
                            "text-[10px] rounded-lg border " + grpInfo.color
                          }
                        >
                          {grpInfo.label}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <Badge
                        variant="secondary"
                        className="text-[10px] rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                      >
                        {product.category}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <div className="flex justify-center">
                        {machines.length === 0 ? (
                          <span className="text-xs text-muted-foreground/50">
                            {"—"}
                          </span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/60 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-100 dark:border-blue-800">
                                <Cog className="w-3 h-3" />
                                <span className="text-xs font-semibold">
                                  {machines.length}
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="bottom"
                              sideOffset={4}
                              className="max-w-[300px] p-3 rounded-xl shadow-lg"
                            >
                              <p className="text-xs font-bold mb-2">
                                Máquinas compatibles
                              </p>
                              <div className="space-y-1.5">
                                {machines.map((m, i) => {
                                  const catInfo = MACHINE_CATEGORIES[m.category];
                                  return (
                                    <div key={i} className="flex items-start gap-2">
                                      <span
                                        className={
                                          "text-[9px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 mt-0.5 " +
                                          (catInfo?.color ||
                                            "bg-slate-100 text-slate-600")
                                        }
                                      >
                                        {catInfo?.label?.split(" ")[0] || "Otro"}
                                      </span>
                                      <div className="min-w-0">
                                        <p className="text-xs font-medium leading-tight">
                                          {m.name}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">
                                          {m.brand} {"·"} {m.model}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={
                          "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border " +
                          (taxInfo?.color || "bg-muted text-muted-foreground border-border")
                        }
                      >
                        {taxInfo?.label || "Gravado"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <p className="font-semibold text-sm">
                        {formatCents(product.price_cents)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{product.unit}</p>
                      {hasTiers && (
                        <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mt-0.5">
                          +{tierCount} escala{tierCount !== 1 ? "s" : ""}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col items-center gap-1">
                        {marginInfo ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={
                                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border cursor-help " +
                                  getMarginBadgeColor(marginInfo.min)
                                }
                              >
                                <TrendingUp className="w-3 h-3" />
                                {marginInfo.min === marginInfo.max
                                  ? marginInfo.min.toFixed(0) + "%"
                                  : marginInfo.min.toFixed(0) +
                                    "%–" +
                                    marginInfo.max.toFixed(0) +
                                    "%"}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent
                              side="bottom"
                              sideOffset={4}
                              className="p-3 rounded-xl shadow-lg max-w-[260px]"
                            >
                              <p className="text-xs font-bold mb-2">
                                Desglose de Margen
                              </p>
                              <div className="space-y-1.5">
                                {marginInfo.details.map((d, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between gap-4 text-xs"
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-muted-foreground truncate">
                                        {d.label}
                                      </span>
                                      <span className="text-muted-foreground/50">
                                        ({"≥"}
                                        {d.min_quantity})
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <span className="font-medium">
                                        {formatCents(d.price_cents)}
                                      </span>
                                      <span
                                        className={
                                          "font-bold " + getMarginColor(d.margin)
                                        }
                                      >
                                        {d.margin.toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-2 pt-2 border-t text-[10px] text-muted-foreground">
                                Costo: {formatCents(product.cost_cents ?? 0)}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">
                            Sin costo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={
                              "text-sm font-bold " +
                              (isOut
                                ? "text-red-500 dark:text-red-400"
                                : isLow
                                ? "text-amber-600 dark:text-amber-400"
                                : isOverMax
                                ? "text-purple-600 dark:text-purple-400"
                                : "text-foreground")
                            }
                          >
                            {product.stock}
                          </span>
                          {isOut && (
                            <Badge
                              variant="secondary"
                              className="text-[8px] rounded px-1 py-0 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800"
                            >
                              Agotado
                            </Badge>
                          )}
                          {isLow && !isOut && (
                            <AlertTriangle className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                          )}
                          {isOverMax && (
                            <Badge
                              variant="secondary"
                              className="text-[8px] rounded px-1 py-0 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800"
                            >
                              Excedido
                            </Badge>
                          )}
                        </div>
                        <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={
                              "h-full rounded-full transition-all " +
                              (isOut
                                ? "bg-red-400"
                                : isLow
                                ? "bg-amber-400"
                                : isOverMax
                                ? "bg-purple-400"
                                : "bg-orange-400")
                            }
                            style={{ width: stockPercent + "%" }}
                          />
                        </div>
                        <div className="flex justify-between w-20 text-[9px] text-muted-foreground">
                          <span>
                            {"mín"} {product.min_stock}
                          </span>
                          <span>
                            {"máx"} {product.max_stock}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-0.5">
                        {onPrintLabel && (
                          <button
                            onClick={() => onPrintLabel(product)}
                            className="p-1.5 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                            title="Imprimir etiqueta"
                          >
                            <Barcode className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
                          </button>
                        )}
                        <button
                          onClick={() => onViewDetail(product)}
                          className="p-1.5 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                          title="Ver detalle"
                        >
                          <Eye className="w-3.5 h-3.5 text-orange-500 dark:text-orange-400" />
                        </button>
                        <button
                          onClick={() => onAdjustStock(product)}
                          className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Ajustar stock"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                        </button>
                        <button
                          onClick={() => onEdit(product)}
                          className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => onDelete(product.id)}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400 dark:text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No se encontraron productos</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
