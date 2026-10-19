import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDebounce } from "@/hooks/useDebounce";
import { useTableSort } from "@/hooks/useTableSort";
import { usePagination } from "@/hooks/usePagination";
import { useProducts } from "@/hooks/useProducts";
import { useBranches } from "@/hooks/useBranches";
import { useProductMutations } from "@/hooks/useProductMutations";
import { useTaxConfig } from "@/lib/tax-config-context";
import { PaginationControls } from "@/components/data-table/PaginationControls";
import { toSoles } from "@/lib/format";
import { exportInventoryCSV } from "@/lib/export";
import { ProductDetailDialog } from "@/components/inventory/ProductDetailDialog";
import { CategoryImageManager } from "@/components/CategoryImageManager";
import { CategoryManager } from "@/components/inventory/CategoryManager";
import { getMarginRange } from "@/lib/pricing";
import { HelpHint } from "@/components/HelpHint";
import { HELP_TEXTS } from "@/lib/help-texts";
import { ProductStats } from "@/components/inventory/ProductStats";
import { ProductFilters } from "@/components/inventory/ProductFilters";
import { ProductTable } from "@/components/inventory/ProductTable";
import { ProductFormDialog } from "@/components/inventory/ProductFormDialog";
import { StockAdjustDialog } from "@/components/inventory/StockAdjustDialog";
import { ReplenishmentAlerts } from "@/components/inventory/ReplenishmentAlerts";
import { BranchStockReport } from "@/components/inventory/BranchStockReport";
import {
  productFormSchema,
  stockAdjustSchema,
  type ProductFormValues,
  type StockAdjustValues,
} from "@/lib/schemas";
import type { Product, MachineModel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PrintLabelsDialog } from "@/components/inventory/PrintLabelsDialog";
import {
  Plus,
  Package,
  Download,
  Upload,
  Image as ImageIcon,
  FolderTree,
  AlertTriangle,
  Bell,
  BarChart3,
  Loader2,
  Barcode,
} from "lucide-react";
import { CSVImportDialog } from "@/components/inventory/CSVImportDialog";
import { showSuccess } from "@/utils/toast";

const productFormDefaults: ProductFormValues = {
  name: "",
  sku: "",
  product_family: "productos",
  category_group: "repuestos",
  category: "",
  description: "",
  price_soles: 0,
  cost_soles: 0,
  stock: 0,
  min_stock: 0,
  max_stock: 0,
  unit: "Unidad",
  supplier: "",
  tax_affectation: "gravado",
  image_url: "",
  tags: [],
  selectedMachineIds: [],
  priceTiers: [],
};

const stockAdjustDefaults: StockAdjustValues = {
  movementType: "in",
  quantity: 1,
  notes: "",
};

export default function Inventory() {
  const navigate = useNavigate();
  const { taxConfig } = useTaxConfig();
  const { branchProducts, priceTiers, productMachines, machineModels,
    products, selectedBranchId: branchId,
    isLoading: productsLoading, error: productsError,
  } = useProducts();
  const { branches, branchStocks, getBranchName,
    isLoading: branchesLoading, error: branchesError,
  } = useBranches();
  const { saveProductAsync, deleteProduct, adjustStock, nextSku, resolveAdjustBranch, isSaving } = useProductMutations();
  const [activeTab, setActiveTab] = useState("products");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [familyFilter, setFamilyFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [machineFilter, setMachineFilter] = useState("all");
  const [taxFilter, setTaxFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [categoryImageOpen, setCategoryImageOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelProductIds, setLabelProductIds] = useState<string[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const alertCount = useMemo(() => {
    const wh = branches.find((b) => b.type === "warehouse" && b.is_active);
    if (!wh) return 0;
    let count = 0;
    const posBranches = branches.filter((b) => b.type === "pos" && b.is_active);
    for (const product of products.filter((p) => p.is_active)) {
      const whBs = branchStocks.find((bs) => bs.branch_id === wh.id && bs.product_id === product.id);
      const whStock = whBs?.stock ?? 0;
      const minStock = whBs?.min_stock ?? product.min_stock;
      for (const pos of posBranches) {
        const posBs = branchStocks.find((bs) => bs.branch_id === pos.id && bs.product_id === product.id);
        const posStock = posBs?.stock ?? 0;
        if (posStock <= 0 && whStock > 0) count++;
        else if (posStock > 0 && posStock <= (posBs?.min_stock ?? product.min_stock)) count++;
      }
      if (whStock > 0 && whStock <= minStock) count++;
    }
    return count;
  }, [branches, branchStocks, products]);

  const productForm = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: productFormDefaults,
  });
  const adjustForm = useForm<StockAdjustValues>({
    resolver: zodResolver(stockAdjustSchema),
    defaultValues: stockAdjustDefaults,
  });

  const machineCompatibleIds = useMemo(() => {
    if (machineFilter === "all") return null;
    return new Set(
      productMachines
        .filter((pm) => pm.machine_model_id === machineFilter)
        .map((pm) => pm.product_id)
    );
  }, [machineFilter, productMachines]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const p of products) {
      if (p.tags) {
        for (const t of p.tags) tagSet.add(t);
      }
    }
    return Array.from(tagSet).sort();
  }, [products]);

  const filtered = useMemo(() => {
    return branchProducts.filter((p) => {
      const q = debouncedSearch.toLowerCase();
      const matchSearch = p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q);
      const matchFamily = familyFilter === "all" || p.product_family === familyFilter;
      const matchGroup = groupFilter === "all" || p.category_group === groupFilter;
      const matchCategory = categoryFilter === "all" || p.category === categoryFilter;
      const matchMachine = !machineCompatibleIds || machineCompatibleIds.has(p.id);
      const matchTax = taxFilter === "all" || p.tax_affectation === taxFilter;
      const matchTag = tagFilter === "all" || (p.tags && p.tags.includes(tagFilter));
      return matchSearch && matchFamily && matchGroup && matchCategory && matchMachine && matchTax && matchTag;
    });
  }, [branchProducts, debouncedSearch, familyFilter, groupFilter, categoryFilter, machineCompatibleIds, taxFilter, tagFilter]);

  const marginMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getMarginRange>>();
    for (const p of filtered) {
      map.set(p.id, getMarginRange(p, priceTiers));
    }
    return map;
  }, [filtered, priceTiers]);

  const productComparators = useMemo(() => ({
    name: (a: Product, b: Product) => a.name.localeCompare(b.name),
    sku: (a: Product, b: Product) => a.sku.localeCompare(b.sku),
    category: (a: Product, b: Product) => a.category.localeCompare(b.category),
    price: (a: Product, b: Product) => a.price_cents - b.price_cents,
    cost: (a: Product, b: Product) => a.cost_cents - b.cost_cents,
    stock: (a: Product, b: Product) => a.stock - b.stock,
    margin: (a: Product, b: Product) => {
      const mA = marginMap.get(a.id);
      const mB = marginMap.get(b.id);
      return (mA?.min ?? 0) - (mB?.min ?? 0);
    },
  }), [marginMap]);

  const { sort, toggleSort, sorted } = useTableSort<Product, "name" | "sku" | "category" | "price" | "cost" | "stock" | "margin">(filtered, {
    comparators: productComparators,
    defaultColumn: "name",
  });
  const pagination = usePagination({ totalItems: sorted.length });
  const paginated = useMemo(() => sorted.slice(pagination.startIndex, pagination.endIndex), [sorted, pagination.startIndex, pagination.endIndex]);

  const adjustTargetBranchName = useMemo(() => {
    if (!adjustProduct) return undefined;
    const targetId = resolveAdjustBranch(branchId);
    if (!targetId) return undefined;
    if (branchId !== "all") return undefined;
    return getBranchName(targetId);
  }, [adjustProduct, branchId, resolveAdjustBranch, getBranchName]);

  const isLoading = productsLoading || branchesLoading;
  const error = productsError || branchesError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-orange-600" />
          <p className="text-sm text-muted-foreground">Cargando inventario...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <AlertTriangle className="w-10 h-10 text-red-500" />
          <div>
            <h2 className="text-lg font-semibold">Error al cargar inventario</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {(error as Error)?.message ?? "Ocurrió un error inesperado"}
            </p>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const updateSearch = (v: string) => { setSearch(v); pagination.resetPage(); };
  const handleCategoryTreeChange = (family: string, group: string, category: string) => {
    setFamilyFilter(family); setGroupFilter(group); setCategoryFilter(category); pagination.resetPage();
  };
  const updateMachineFilter = (v: string) => { setMachineFilter(v); pagination.resetPage(); };
  const updateTaxFilter = (v: string) => { setTaxFilter(v); pagination.resetPage(); };
  const updateTagFilter = (v: string) => { setTagFilter(v); pagination.resetPage(); };

  const getMachinesForProduct = (productId: string) =>
    productMachines.filter((pm) => pm.product_id === productId)
      .map((pm) => machineModels.find((m) => m.id === pm.machine_model_id))
      .filter(Boolean) as MachineModel[];

  const handleExportCSV = () => {
    const activeBranches = branches.filter((b) => b.is_active);
    exportInventoryCSV(sorted, { getMachinesForProduct, branches: activeBranches, branchStocks });
    showSuccess("Exportados " + sorted.length + " productos a CSV");
  };

  const openDetail = (product: Product) => { setDetailProduct(product); setDetailOpen(true); };
  const closeDetail = () => { setDetailOpen(false); setDetailProduct(null); };

  const openNew = () => {
    setEditingProduct(null);
    productForm.reset({
      ...productFormDefaults,
      sku: nextSku(productFormDefaults.category),
      tax_affectation: taxConfig.defaultTaxAffectation,
    });
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    productForm.reset({
      name: product.name, sku: product.sku, product_family: product.product_family,
      category_group: product.category_group, category: product.category,
      description: product.description || "", price_soles: toSoles(product.price_cents),
      cost_soles: toSoles(product.cost_cents), stock: product.stock, min_stock: product.min_stock,
      max_stock: product.max_stock, unit: product.unit, supplier: product.supplier || "",
      tax_affectation: product.tax_affectation || "gravado", image_url: product.image_url || "",
      tags: product.tags || [],
      selectedMachineIds: productMachines.filter((pm) => pm.product_id === product.id).map((pm) => pm.machine_model_id),
      priceTiers: priceTiers.filter((t) => t.product_id === product.id)
        .sort((a, b) => a.min_quantity - b.min_quantity)
        .map((t) => ({ label: t.label, min_quantity: t.min_quantity, price_soles: t.price_cents / 100 })),
    });
    setDialogOpen(true);
  };

  const openAdjust = (product: Product) => {
    setAdjustProduct(product); adjustForm.reset(stockAdjustDefaults); setAdjustOpen(true);
  };

  const handleSave = async (data: ProductFormValues) => {
    try {
      await saveProductAsync(data, editingProduct);
      setDialogOpen(false);
    } catch {
      // handled by onError
    }
  };

  const handleAdjustStock = (data: StockAdjustValues) => {
    if (!adjustProduct) return;
    const targetBranch = resolveAdjustBranch(branchId);
    if (!targetBranch) return;
    adjustStock(adjustProduct.id, targetBranch, data, adjustProduct.name);
    setAdjustOpen(false);
  };

  const confirmDelete = () => {
    if (deleteId) deleteProduct(deleteId);
    setDeleteOpen(false); setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl md:text-3xl font-bold">Inventario</h1>
        <HelpHint {...HELP_TEXTS.inventory} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-200/70 dark:bg-slate-700/50 rounded-xl p-1">
          <TabsTrigger value="products" className="rounded-lg gap-2 data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-orange-600/20">
            <Package className="w-4 h-4" />Productos
          </TabsTrigger>
          <TabsTrigger value="categories" className="rounded-lg gap-2 data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-orange-600/20">
            <FolderTree className="w-4 h-4" />Categorías
          </TabsTrigger>
          <TabsTrigger value="alerts" className="rounded-lg gap-2 data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-orange-600/20">
            <Bell className="w-4 h-4" />Alertas
            {alertCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white">{alertCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="report" className="rounded-lg gap-2 data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-orange-600/20">
            <BarChart3 className="w-4 h-4" />Stock por Sede
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {filtered.length} productos · {filtered.filter((p) => p.stock > 0 && p.stock <= p.min_stock).length} con stock bajo
              {branchId !== "all" ? " · " + getBranchName(branchId) : ""}
            </p>
            <div className="flex gap-2 flex-wrap">
              {branches.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 self-center">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Crea al menos una sede para agregar productos
                </p>
              )}
              <Button variant="outline" onClick={() => setCategoryImageOpen(true)} className="rounded-xl">
                <ImageIcon className="w-4 h-4 mr-2" />Imágenes
              </Button>
              <Button variant="outline" onClick={handleExportCSV} disabled={sorted.length === 0} className="rounded-xl">
                <Download className="w-4 h-4 mr-2" />CSV
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)} disabled={branches.length === 0} className="rounded-xl">
                <Upload className="w-4 h-4 mr-2" />Importar
              </Button>
              <Button variant="outline" onClick={() => { setLabelProductIds([]); setLabelsOpen(true); }} disabled={sorted.length === 0} className="rounded-xl">
                <Barcode className="w-4 h-4 mr-2" />Etiquetas
              </Button>
              <Button onClick={openNew} disabled={branches.length === 0} className="rounded-xl bg-orange-600 hover:bg-orange-700">
                <Plus className="w-4 h-4 mr-2" />Nuevo
              </Button>
            </div>
          </div>

          <ProductFilters search={search} onSearchChange={updateSearch} taxFilter={taxFilter} onTaxFilterChange={updateTaxFilter}
            machineFilter={machineFilter} onMachineFilterChange={updateMachineFilter}
            tagFilter={tagFilter} onTagFilterChange={updateTagFilter} allTags={allTags}
            familyFilter={familyFilter} groupFilter={groupFilter}
            categoryFilter={categoryFilter} onCategoryTreeChange={handleCategoryTreeChange} machineModels={machineModels} />

          <ProductStats filtered={filtered} priceTiers={priceTiers} />

          <ProductTable paginated={paginated} sort={sort} toggleSort={toggleSort} filtered={filtered}
            priceTiers={priceTiers} productMachines={productMachines} machineModels={machineModels}
            marginMap={marginMap} onViewDetail={openDetail} onAdjustStock={openAdjust} onEdit={openEdit}
            onDelete={(id) => { setDeleteId(id); setDeleteOpen(true); }}
            onPrintLabel={(product) => { setLabelProductIds([product.id]); setLabelsOpen(true); }}
          />

          <PaginationControls pagination={pagination} totalItems={sorted.length} itemLabel="productos" />
        </TabsContent>

        <TabsContent value="categories" className="mt-6">
          <CategoryManager />
        </TabsContent>

        <TabsContent value="alerts" className="mt-6">
          <ReplenishmentAlerts
            onTransferSuggest={(productId, fromBranchId, toBranchId, quantity) => {
              navigate("/admin/transfers", {
                state: { productId, fromBranchId, toBranchId, quantity },
              });
            }}
          />
        </TabsContent>

        <TabsContent value="report" className="mt-6">
          <BranchStockReport />
        </TabsContent>
      </Tabs>

      <ProductFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editingProduct={editingProduct}
        form={productForm} machineModels={machineModels} productMachines={productMachines}
        priceTiers={priceTiers} onSave={handleSave} isSaving={isSaving} />

      <StockAdjustDialog open={adjustOpen} onOpenChange={setAdjustOpen} adjustProduct={adjustProduct}
        form={adjustForm} onSave={handleAdjustStock} targetBranchName={adjustTargetBranchName} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El producto será eliminado del inventario.
              {deleteId && (() => {
                const totalStock = branchStocks
                  .filter(bs => bs.product_id === deleteId)
                  .reduce((sum, bs) => sum + bs.stock, 0);
                return totalStock > 0 ? (
                  <span className="block mt-2 text-amber-600 dark:text-amber-400 font-medium">
                    ⚠ Este producto tiene {totalStock} unidades en stock. Considera transferir o vender antes de eliminar.
                  </span>
                ) : null;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="rounded-xl bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {detailProduct && (
        <ProductDetailDialog product={detailProduct} open={detailOpen} onClose={closeDetail}
          onEdit={(product) => { closeDetail(); openEdit(product); }}
          onAdjustStock={(product) => { closeDetail(); openAdjust(product); }} />
      )}

      <CategoryImageManager open={categoryImageOpen} onClose={() => setCategoryImageOpen(false)} />

      <CSVImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <PrintLabelsDialog open={labelsOpen} onClose={() => setLabelsOpen(false)} preselectedIds={labelProductIds} />
    </div>
  );
}
