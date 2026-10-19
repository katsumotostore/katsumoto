import { describe, expect, it } from "vitest";
import { generateProductLabels } from "../labels/generate-labels";
import { generateBarcode } from "../../barcode";
import type { Product } from "../../types";
import { seller } from "./fixtures";

const product = {
  name: "Aceite 2T Castrol 500ml", sku: "ACE-001", barcode: generateBarcode(1),
  price_cents: 2500, unit: "unidad",
} as Product;

describe("label PDF generation", () => {
  it.each([1, 25])("omits prices while preserving product details for %i copies", (copies) => {
    const output = generateProductLabels({ sellerInfo: seller, products: [product], copies }).output();
    expect(output).not.toContain("S/");
    expect(output).not.toContain("(25.00)");
    expect(output).toContain(product.name);
    expect(output).toContain(`SKU: ${product.sku}`);
    expect(output).toContain(product.unit);
  });
  it("uses per-product copies and rejects invalid quantities and codes", () => {
    const p = { ...product, id: "p1" };
    expect(generateProductLabels({ sellerInfo: seller, products: [p], copiesByProduct: { p1: 25 } }).getNumberOfPages()).toBe(2);
    expect(() => generateProductLabels({ sellerInfo: seller, products: [p], copiesByProduct: { p1: 0 } })).toThrow();
    expect(() => generateProductLabels({ sellerInfo: seller, products: [{ ...p, barcode: "" }] })).toThrow();
  });
  it("serializes a valid barcode without invalid character spacing", () => {
    const doc = generateProductLabels({ sellerInfo: seller, products: [product] });
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1000);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.output()).not.toContain("NaN");
    expect(doc.getCharSpace()).toBe(0);
  });
  it("paginates more than 24 labels", () => {
    const products = Array.from({ length: 25 }, (_, i) => ({ ...product, barcode: generateBarcode(i + 1) }));
    const doc = generateProductLabels({ sellerInfo: seller, products });
    expect(doc.getNumberOfPages()).toBe(2);
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1000);
  });
});
