import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BranchStockReport } from "./BranchStockReport";

vi.mock("@/hooks/useBranches", () => ({ useBranches: () => ({
  branches: [
    { id: "central", name: "Central", type: "warehouse", is_active: true },
    { id: "web", name: "Web", type: "online", is_active: true, stock_source_branch_id: "central" },
    { id: "old", name: "Cerrada", type: "pos", is_active: false },
  ],
  branchStocks: [
    { branch_id: "central", product_id: "goods", stock: 10 },
    { branch_id: "central", product_id: "zero", stock: 0 },
    { branch_id: "central", product_id: "service", stock: 100 },
    { branch_id: "central", product_id: "inactive", stock: 200 },
    { branch_id: "web", product_id: "goods", stock: 50 },
    { branch_id: "old", product_id: "goods", stock: 300 },
  ],
}) }));
vi.mock("@/hooks/useProducts", () => ({ useProducts: () => ({ products: [
  { id: "goods", name: "Repuesto activo", sku: "A", is_active: true, product_family: "productos", min_stock: 2 },
  { id: "zero", name: "Agotado asignado", sku: "B", is_active: true, product_family: "productos" },
  { id: "missing", name: "Sin registro", sku: "C", is_active: true, product_family: "productos" },
  { id: "service", name: "Servicio excluido", sku: "S", is_active: true, product_family: "servicios" },
  { id: "inactive", name: "Inactivo excluido", sku: "I", is_active: false, product_family: "productos" },
] }) }));

describe("Stock por sede", () => {
  it("no suma servicios, inactivos, sedes cerradas ni registros residuales de espejos", () => {
    const html = renderToStaticMarkup(createElement(BranchStockReport));
    expect(html).toContain('>10 <span');
    expect(html).toContain('3 productos físicos activos');
    expect(html).not.toContain('Servicio excluido');
    expect(html).not.toContain('Inactivo excluido');
    expect(html).not.toContain('Cerrada');
    expect(html).toContain('Stock compartido: no suma al total.');
  });
  it("distingue un producto agotado de uno sin registro y avisa de residuos", () => {
    const html = renderToStaticMarkup(createElement(BranchStockReport));
    expect(html).toContain('1 productos sin asignación');
    expect(html).toContain('>Agotado</p>');
    expect(html).toContain('>Sin asignación</p>');
    expect(html).toContain('Se excluyen 1 registros');
  });
});
