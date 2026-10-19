import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Product } from "@/lib/types";

const { rpc, single } = vi.hoisted(() => ({ rpc: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc }, getCurrentOrgId: () => "org" }));
import { productService } from "./product.service";

describe("barcode repair service", () => {
  beforeEach(() => { vi.clearAllMocks(); rpc.mockReturnValue({ single }); });
  it("requests a single product and sends the expected previous code", async () => {
    const product = { id: "p1", barcode: "123" } as Product;
    const updated = { ...product, barcode: "2000000000015" };
    single.mockResolvedValue({ data: updated, error: null });
    expect(await productService.repairBarcode(product, null)).toEqual(updated);
    expect(rpc).toHaveBeenCalledWith("repair_product_barcode", { p_product_id: "p1", p_expected_barcode: "123", p_new_barcode: null });
    expect(single).toHaveBeenCalledOnce();
  });
  it("surfaces a concurrency error without retrying a new assignment", async () => {
    single.mockResolvedValue({ data: null, error: { code: "40001", message: "El codigo cambio" } });
    await expect(productService.repairBarcode({ id: "p1", barcode: "123" } as Product, null)).rejects.toThrow("El codigo cambio");
    expect(rpc).toHaveBeenCalledOnce();
  });
});
