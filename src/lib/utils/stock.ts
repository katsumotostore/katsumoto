import type { BranchStock, Branch, Product } from "@/lib/types";

export function resolveBranchId(
  branches: Branch[],
  branchId: string
): string {
  const branch = branches.find((b) => b.id === branchId);
  return branch?.stock_source_branch_id || branchId;
}

export function getBranchStock(
  branchStocks: BranchStock[],
  branchId: string,
  productId: string,
  branches?: Branch[]
): number {
  const resolvedId = branches
    ? resolveBranchId(branches, branchId)
    : branchId;
  return (
    branchStocks.find(
      (bs) => bs.branch_id === resolvedId && bs.product_id === productId
    )?.stock ?? 0
  );
}

export function getTotalStock(
  branchStocks: BranchStock[],
  productId: string,
  branches?: Branch[]
): number {
  const physicalBranchIds = branches
    ? branches.filter((b) => !b.stock_source_branch_id).map((b) => b.id)
    : null;
  return branchStocks
    .filter(
      (bs) =>
        bs.product_id === productId &&
        (!physicalBranchIds || physicalBranchIds.includes(bs.branch_id))
    )
    .reduce((sum, bs) => sum + bs.stock, 0);
}

export function getBranchStockRecord(
  branchStocks: BranchStock[],
  branchId: string,
  productId: string,
  branches?: Branch[]
): BranchStock | undefined {
  const resolvedId = branches
    ? resolveBranchId(branches, branchId)
    : branchId;
  return branchStocks.find(
    (bs) => bs.branch_id === resolvedId && bs.product_id === productId
  );
}

export function getProductsWithBranchStock(
  products: Product[],
  branchStocks: BranchStock[],
  branchId: string,
  branches?: Branch[]
): Product[] {
  const physicalBranchIds = branches
    ? branches
        .filter((b) => !b.stock_source_branch_id)
        .map((b) => b.id)
    : null;

  if (branchId === "all") {
    return products.map((p) => {
      const allBs = physicalBranchIds
        ? branchStocks.filter(
            (s) =>
              s.product_id === p.id && physicalBranchIds.includes(s.branch_id)
          )
        : branchStocks.filter((s) => s.product_id === p.id);
      const totalStock = allBs.reduce((sum, s) => sum + s.stock, 0);
      return { ...p, stock: totalStock };
    });
  }

  const resolvedId = branches
    ? resolveBranchId(branches, branchId)
    : branchId;

  return products.map((p) => {
    const bs = branchStocks.find(
      (s) => s.branch_id === resolvedId && s.product_id === p.id
    );
    return {
      ...p,
      stock: bs?.stock ?? 0,
      min_stock: bs?.min_stock ?? p.min_stock,
      max_stock: bs?.max_stock ?? p.max_stock,
    };
  });
}

export function getDisplayStock(stock: number, threshold = 20): string | number {
  if (stock <= 0) return "Agotado";
  if (stock <= threshold) return String(stock);
  return `>${threshold}`;
}

export function getWarehouseBranchId(branches: Branch[]): string | null {
  return branches.find((b) => b.type === "warehouse" && b.is_active)?.id ?? null;
}

export function getStoreStockBranchId(branches: Branch[]): string | null {
  const onlineBranch = branches.find((b) => b.type === "online" && b.is_active);
  if (onlineBranch) return onlineBranch.stock_source_branch_id || onlineBranch.id;
  return getWarehouseBranchId(branches);
}
