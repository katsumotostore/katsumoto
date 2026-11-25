import { describe, expect, it } from "vitest";
import { getProductsWithBranchStock } from "./stock";
import type { Product, BranchStock, Branch } from "@/lib/types";

describe("límites de inventario por sede", () => {
  const products = [{ id: "p", stock: 99, min_stock: 3, max_stock: 50 }] as Product[];
  const stocks = [
    { product_id: "p", branch_id: "a", stock: 12, min_stock: 5, max_stock: 20 },
    { product_id: "p", branch_id: "b", stock: 4, min_stock: 0, max_stock: 0 },
  ] as BranchStock[];
  it("cambia ambos límites y respeta ceros al alternar de sede", () => {
    expect(getProductsWithBranchStock(products, stocks, "a")[0]).toMatchObject({ min_stock: 5, max_stock: 20 });
    expect(getProductsWithBranchStock(products, stocks, "b")[0]).toMatchObject({ min_stock: 0, max_stock: 0 });
    expect(getProductsWithBranchStock(products, stocks, "a")[0]).toMatchObject({ min_stock: 5, max_stock: 20 });
    expect(products[0].max_stock).toBe(50);
  });
  it("usa los límites de la sede origen en la tienda espejo", () => {
    const branches = [{ id: "web", stock_source_branch_id: "a" }] as Branch[];
    expect(getProductsWithBranchStock(products, stocks, "web", branches)[0]).toMatchObject({stock:12,min_stock:5,max_stock:20});
  });
  it("conserva los valores generales solo para sedes sin configuración", () => {
    expect(getProductsWithBranchStock(products, stocks, "missing")[0]).toMatchObject({stock:0,min_stock:3,max_stock:50});
  });
});
