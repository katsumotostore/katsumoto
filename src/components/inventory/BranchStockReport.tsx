import { useMemo, useState } from "react";
import { useBranches } from "@/hooks/useBranches";
import { useProducts } from "@/hooks/useProducts";
import { getBranchStock, getTotalStock, getBranchStockRecord } from "@/lib/utils/stock";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Warehouse, Store, Globe, Package, Search, Filter, Copy, type LucideIcon } from "lucide-react";

type FilterMode = "all" | "low_stock" | "out_of_stock" | "imbalance" | "unassigned";

const branchTypeIcons: Record<string, LucideIcon> = { warehouse: Warehouse, pos: Store, online: Globe };

export function BranchStockReport() {
  const { branches, branchStocks } = useBranches();
  const { products } = useProducts();
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  const activeBranches = useMemo(
    () => branches.filter((b) => b.is_active),
    [branches]
  );

  const activeProducts = useMemo(
    () => products.filter((p) => p.is_active && p.product_family === "productos"),
    [products]
  );

  const reportData = useMemo(() => {
    return activeProducts
      .map((product) => {
        const branchData = activeBranches.map((branch) => {
          const isMirror = !!branch.stock_source_branch_id;
          const stock = getBranchStock(branchStocks, branch.id, product.id, branches);
          const resolvedId = isMirror ? branch.stock_source_branch_id! : branch.id;
          const bs = getBranchStockRecord(branchStocks, resolvedId, product.id);
          return {
            branchId: branch.id,
            branchName: branch.name,
            branchType: branch.type,
            isMirror,
            sourceBranchName: isMirror
              ? branches.find((b) => b.id === branch.stock_source_branch_id)?.name || ""
              : "",
            stock,
            assigned: !!bs,
            minStock: bs?.min_stock ?? product.min_stock,
            maxStock: bs?.max_stock ?? product.max_stock,
          };
        });
        const totalStock = getTotalStock(branchStocks, product.id, activeBranches);
        return {
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          category: product.category,
          totalStock,
          branchData,
        };
      })
      .filter((item) => {
        const q = search.toLowerCase();
        if (q && !item.productName.toLowerCase().includes(q) && !item.productSku.toLowerCase().includes(q)) {
          return false;
        }
        if (filterMode === "out_of_stock") {
          return item.branchData.some((bd) => !bd.isMirror && bd.assigned && bd.stock === 0);
        }
        if (filterMode === "unassigned") return item.branchData.some((bd) => !bd.isMirror && !bd.assigned);
        if (filterMode === "low_stock") {
          return item.branchData.some(
            (bd) => !bd.isMirror && bd.stock > 0 && bd.stock <= bd.minStock
          );
        }
        if (filterMode === "imbalance") {
          const physicalStocks = item.branchData.filter((bd) => !bd.isMirror && bd.assigned).map((bd) => bd.stock);
          const max = Math.max(...physicalStocks);
          const zeroes = physicalStocks.filter((s) => s === 0).length;
          return max > 0 && zeroes > 0;
        }
        return true;
      });
  }, [activeProducts, activeBranches, branchStocks, branches, search, filterMode]);

  const branchSummary = useMemo(() => {
    return activeBranches.map((branch) => {
      const isMirror = !!branch.stock_source_branch_id;
      const values = reportData.flatMap((item) => item.branchData.filter((bd) => bd.branchId === branch.id));
      const totalProducts = values.filter((bd) => bd.assigned && bd.stock > 0).length;
      const totalUnits = values.reduce((sum, bd) => sum + bd.stock, 0);
      const outOfStock = values.filter((bd) => bd.assigned && bd.stock === 0).length;
      const unassigned = values.filter((bd) => !bd.assigned).length;
      return { branch, isMirror, totalProducts, totalUnits, outOfStock, unassigned };
    });
  }, [activeBranches, reportData]);

  const residualRows = branchStocks.filter((bs) => activeBranches.some((b) => b.stock_source_branch_id && b.id === bs.branch_id));
  const serviceCount = products.filter((p) => p.is_active && p.product_family === "servicios").length;
  const totalUnits = reportData.reduce((sum, item) => sum + item.totalStock, 0);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-muted/20 p-5 space-y-2">
        <h3 className="text-lg font-semibold">Inventario físico por sede</h3>
        <p className="text-3xl font-bold tabular-nums">{totalUnits.toLocaleString("es-PE")} <span className="text-sm font-normal text-muted-foreground">unidades registradas</span></p>
        <p className="text-sm text-muted-foreground">{reportData.length} productos físicos activos · Solo sedes activas · {serviceCount} servicios excluidos</p>
        <p className="text-sm text-muted-foreground">Las tarjetas y la tabla responden a los mismos filtros. El total cuenta cada sede física una sola vez.</p>
      </div>
      {residualRows.length > 0 && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-semibold">Registros propios de sedes con stock compartido</p>
        <p>Se excluyen {residualRows.length} registros de stock independientes de estas sedes para evitar duplicaciones. Permanecen en la base de datos para su conciliación.</p>
      </div>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {branchSummary.map(({ branch, isMirror, totalProducts, totalUnits, outOfStock, unassigned }) => {
          const Icon = branchTypeIcons[branch.type] || Package;
          return (
            <Card key={branch.id} className="rounded-2xl shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center">
                    {isMirror ? <Copy className="w-5 h-5 text-blue-600 dark:text-blue-400" /> : <Icon className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{branch.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {isMirror ? `Comparte stock con ${branches.find((b) => b.id === branch.stock_source_branch_id)?.name || "sede no disponible"}` : ({ warehouse: "Almacén", pos: "Punto de venta", online: "Tienda virtual" }[branch.type] || "Sede")}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-green-600">{totalProducts}</p>
                    <p className="text-[10px] text-muted-foreground">Productos con existencias</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{totalUnits}</p>
                    <p className="text-[10px] text-muted-foreground">Unidades registradas</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-red-600">{outOfStock}</p>
                    <p className="text-[10px] text-muted-foreground">Productos agotados</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{unassigned} productos sin asignación</p>
                {isMirror && <p className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400">Stock compartido: no suma al total.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            aria-label="Buscar producto por nombre o SKU" placeholder="Buscar producto por nombre o SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
            <SelectTrigger aria-label="Filtrar por estado de stock" className="rounded-xl w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="low_stock">Stock bajo</SelectItem>
              <SelectItem value="out_of_stock">Agotados en alguna sede</SelectItem>
              <SelectItem value="unassigned">Sin asignación en alguna sede</SelectItem>
              <SelectItem value="imbalance">Desbalance</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Producto</th>
                  <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Total físico</th>
                  {activeBranches.map((b) => (
                    <th key={b.id} className="text-center py-3 px-4 font-semibold text-muted-foreground">
                      {b.name}
                      {b.stock_source_branch_id && <span className="block text-[10px] text-blue-500 font-normal">(compartido, no suma)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportData.map((item) => (
                  <tr key={item.productId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-sm">{item.productName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.productSku}</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-bold ${item.totalStock === 0 ? "text-red-600" : "text-foreground"}`}>
                        {item.totalStock}
                      </span>
                    </td>
                    {item.branchData.map((bd) => {
                      const isLow = !bd.isMirror && bd.stock > 0 && bd.stock <= bd.minStock;
                      const isZero = bd.assigned && bd.stock === 0;
                      return (
                        <td key={bd.branchId} className="py-3 px-4 text-center">
                          <span className={`font-bold ${bd.isMirror ? "text-blue-600" : isZero ? "text-red-600" : isLow ? "text-amber-600" : "text-green-600"}`}>
                            {bd.assigned ? bd.stock : "—"}
                          </span>
                          {!bd.assigned && <p className="text-xs text-muted-foreground">Sin asignación</p>}
                          {bd.assigned && isZero && <p className="text-xs text-red-600">Agotado</p>}
                          {isLow && !isZero && (
                            <p className="text-[10px] text-amber-600">mín. {bd.minStock}</p>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {reportData.length === 0 && (
                  <tr>
                    <td colSpan={2 + activeBranches.length} className="text-center py-12 text-muted-foreground">
                      <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
                      <p>No se encontraron productos</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Los saldos reflejan los registros actuales; no certifican un conteo físico. Desbalance compara productos asignados con existencias en una sede y agotados en otra. Las notas y los saldos iniciales deben conciliarse antes de ajustar existencias.
      </p>
    </div>
  );
}
