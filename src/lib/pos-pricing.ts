import type { Cents, PriceTier, Product } from "./types";
import { getEffectivePriceInfo } from "./pricing";

export function parseServicePrice(value: string): Cents | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 2147483647 ? cents as Cents : null;
}

export function getPosPriceFields(product: Product, tiers: PriceTier[], quantity: number, manualPriceCents?: Cents) {
  if (product.product_family === "servicios" && manualPriceCents !== undefined &&
      Number.isSafeInteger(manualPriceCents) && manualPriceCents > 0 && manualPriceCents <= 2147483647) {
    return { effectivePriceCents: manualPriceCents, manualPriceCents, appliedTierLabel: undefined, isTierPrice: false, savingsCents: undefined };
  }
  const info = getEffectivePriceInfo(product, tiers, quantity);
  return { effectivePriceCents: info.priceCents, manualPriceCents: undefined, appliedTierLabel: info.tierLabel, isTierPrice: !info.isRetail, savingsCents: info.savingsCents };
}
