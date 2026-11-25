import { branchService } from "@/services/branch.service";
import { resolveBranchId } from "@/lib/utils/stock";
import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBranches } from "@/hooks/useBranches";
import { toCents } from "@/lib/format";
import { showSuccess, showError } from "@/utils/toast";
import { productService } from "@/services/product.service";
import { stockService } from "@/services/stock.service";
import { queryKeys } from "@/lib/query-keys";
import type { Product, Cents, PriceTier, ProductFormData } from "@/lib/types";
import type { ProductFormValues, StockAdjustValues } from "@/lib/schemas";

export function useProductMutations() {
  const queryClient = useQueryClient();
  const { branches, selectedBranchId } = useBranches();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.products.allTiers });
    queryClient.invalidateQueries({ queryKey: queryKeys.machines.productMachines });
    queryClient.invalidateQueries({ queryKey: queryKeys.branches.allStock });
    queryClient.invalidateQueries({ queryKey: queryKeys.movements.all });
  };

  const saveProductMutation = useMutation({
    mutationFn: async ({
      data,
      editingProduct,
      branchId,
    }: {
      data: ProductFormValues;
      editingProduct: Product | null;
      branchId: string;
    }) => {
      const productPayload: Partial<ProductFormData> = {
        name: data.name,
        sku: data.sku,
        product_family: data.product_family,
        category_group: data.category_group,
        category: data.category,
        category_id: data.category_id,
        description: data.description || undefined,
        unit: data.unit,
        price_cents: toCents(data.price_soles) as Cents,
        cost_cents: toCents(data.cost_soles) as Cents,
        min_stock: data.min_stock,
        max_stock: data.max_stock,
        supplier: data.supplier || undefined,
        tax_affectation: data.tax_affectation,
        image_url: data.image_url || null,
        tags: data.tags || [],
      };

      if (editingProduct && branchId !== "all") { delete productPayload.min_stock; delete productPayload.max_stock; }
      let savedProduct: Product;
      if (editingProduct) {
        savedProduct = await productService.update(editingProduct.id, productPayload);
      } else {
        savedProduct = await productService.create(productPayload as ProductFormData);
      }

      if (editingProduct && branchId !== "all") {
        await branchService.setStockLimits(resolveBranchId(branches, branchId), savedProduct.id, data.min_stock, data.max_stock);
      }

      await productService.saveMachineModels(savedProduct.id, data.selectedMachineIds);

      const tiers: Omit<PriceTier, "id">[] = data.priceTiers
        .filter((t) => t.min_quantity > 1 && t.price_soles > 0)
        .sort((a, b) => a.min_quantity - b.min_quantity)
        .map((t) => ({
          product_id: savedProduct.id,
          min_quantity: t.min_quantity,
          price_cents: toCents(t.price_soles) as Cents,
          label: t.label,
        }));
      await productService.savePriceTiers(savedProduct.id, tiers);

      if (!editingProduct && data.stock > 0) {
        const targetBranch = branches.find((b) => b.is_default) || branches.find((b) => b.type === "warehouse") || branches[0];
        if (targetBranch) {
          await stockService.adjust(savedProduct.id, targetBranch.id, "in", data.stock, "Stock inicial");
        }
      }

      return { savedProduct, data, editingProduct };
    },
    onSuccess: ({ editingProduct }) => {
      invalidateAll();
      showSuccess(
        editingProduct
          ? "Producto actualizado correctamente"
          : "Producto agregado al inventario"
      );
    },
    onError: (err) => {
      showError("Error al guardar producto: " + err.message);
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id: string) => productService.remove(id),
    onSuccess: () => {
      invalidateAll();
      showSuccess("Producto eliminado del inventario");
    },
    onError: (err) => {
      showError("Error al eliminar producto: " + err.message);
    },
  });

  const adjustStockMutation = useMutation({
    mutationFn: ({
      productId,
      branchId,
      data,
    }: {
      productId: string;
      branchId: string;
      data: StockAdjustValues;
      productName: string;
    }) => stockService.adjust(productId, branchId, data.movementType, data.quantity, data.notes),
    onSuccess: (_, { data, productName }) => {
      invalidateAll();
      const cfg: Record<string, string> = {
        in: "Entrada registrada",
        out: "Salida registrada",
        adjustment: "Ajuste aplicado",
      };
      showSuccess(cfg[data.movementType] + " \u2014 " + productName + ": " + data.quantity + " uds.");
    },
    onError: (err) => {
      showError("Error al ajustar stock: " + err.message);
    },
  });

  const saveProduct = useCallback((data: ProductFormValues, editingProduct: Product | null) =>
    saveProductMutation.mutate({ data, editingProduct, branchId: selectedBranchId }), [saveProductMutation, selectedBranchId]);

  const saveProductAsync = useCallback((data: ProductFormValues, editingProduct: Product | null) =>
    saveProductMutation.mutateAsync({ data, editingProduct, branchId: selectedBranchId }), [saveProductMutation, selectedBranchId]);

  const deleteProduct = useCallback((id: string) => deleteProductMutation.mutate(id), [deleteProductMutation]);

  const adjustStock = useCallback((
    productId: string,
    branchId: string,
    data: StockAdjustValues,
    productName: string
  ) =>
    adjustStockMutation.mutate({
      productId,
      branchId,
      data,
      productName,
    }), [adjustStockMutation]);

  const nextSku = useCallback((category?: string) => {
    const products = queryClient.getQueryData<Product[]>(queryKeys.products.all) || [];
    const prefix = "01";
    let catCode = "GEN";
    if (category) {
      const words = category.replace(/[/]/g, " ").split(/\s+/).filter(Boolean);
      if (words.length === 1) {
        catCode = words[0].substring(0, 3).toUpperCase();
      } else {
        catCode = words.map(w => w[0]).join("").substring(0, 3).toUpperCase();
      }
    }
    const existingNums = products
      .filter(p => {
        const parts = p.sku.split("-");
        return parts.length === 3 && parts[0] === prefix && parts[1] === catCode;
      })
      .map(p => parseInt(p.sku.split("-")[2], 10))
      .filter(n => !isNaN(n));
    const next = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
    return `${prefix}-${catCode}-${String(next).padStart(3, "0")}`;
  }, [queryClient]);

  const resolveAdjustBranch = useCallback(
    (branchId: string) => {
      if (branchId !== "all") return branchId;
      const defaultBranch = branches.find((b) => b.is_default);
      if (defaultBranch) return defaultBranch.id;
      const posBranch = branches.find((b) => b.type !== "warehouse" && b.is_active);
      if (posBranch) return posBranch.id;
      return branches[0]?.id || null;
    },
    [branches]
  );

  return {
    saveProduct,
    saveProductAsync,
    deleteProduct,
    adjustStock,
    nextSku,
    resolveAdjustBranch,
    isSaving: saveProductMutation.isPending,
    isDeleting: deleteProductMutation.isPending,
  };
}
