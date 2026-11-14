import { describe, expect, it } from "vitest";
import { getPosPriceFields, parseServicePrice } from "./pos-pricing";
import { calculateInvoice } from "./calculations";
import type { Product, PriceTier } from "./types";

const service = { id: "service-1", name: "Mantenimiento", product_family: "servicios", price_cents: 10000 } as Product;
const tiers = [{ product_id: service.id, min_quantity: 10, price_cents: 8000, label: "Mayorista" }] as PriceTier[];

describe("precio de servicios en POS", () => {
  it.each([["118.25", 11825], ["118,25", 11825], [" 50 ", 5000], ["0.01", 1]])("convierte %s a centimos", (value, cents) => {
    expect(parseServicePrice(value)).toBe(cents);
  });
  it.each(["", " ", "0", "-1", "1.234", "1e3", "Infinity", "NaN", "21,474,836", "21474836.48"])("rechaza %s", (value) => {
    expect(parseServicePrice(value)).toBeNull();
  });
  it("conserva el precio acordado al aumentar cantidad incluso si alcanza un tramo", () => {
    const initial = getPosPriceFields(service, tiers, 1, 11800);
    const increased = getPosPriceFields(service, tiers, 10, initial.manualPriceCents);
    expect(increased.effectivePriceCents).toBe(11800);
    expect(increased.isTierPrice).toBe(false);
    expect(increased.savingsCents).toBeUndefined();
    expect(service.price_cents).toBe(10000);
  });
  it("restaura el precio automatico segun la cantidad actual", () => {
    expect(getPosPriceFields(service, tiers, 10).effectivePriceCents).toBe(8000);
    expect(getPosPriceFields(service, tiers, 1).effectivePriceCents).toBe(10000);
  });
  it("mantiene los precios por cantidad para productos fisicos", () => {
    const product = { ...service, product_family: "productos" } as Product;
    expect(getPosPriceFields(product, tiers, 10, 5000).effectivePriceCents).toBe(8000);
    expect(getPosPriceFields(product, tiers, 10, 5000).manualPriceCents).toBeUndefined();
  });
  it.each(["gravado", "exonerado"] as const)("calcula el comprobante %s con el precio acordado", (tax) => {
    const fields = getPosPriceFields(service, tiers, 2, 11800);
    const result = calculateInvoice([{ product_id: service.id, product_name: service.name, quantity: 2, unit_price_cents: fields.effectivePriceCents, discount_percent: 0, tax_affectation: tax }]);
    expect(result.total_cents).toBe(23600);
    expect(result.items[0].unit_price_cents).toBe(11800);
    expect(result.igv_cents).toBe(tax === "gravado" ? 3600 : 0);
  });
});
