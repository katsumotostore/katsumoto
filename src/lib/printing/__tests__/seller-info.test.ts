import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, branchEq, branchResult } = vi.hoisted(() => ({
  from: vi.fn(), branchEq: vi.fn(), branchResult: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from }, getCurrentOrgId: () => "org" }));
import { getSellerInfo } from "../seller-info";

describe("seller contact for printing", () => {
  it("loads the branch address without replacing the fiscal address or email", async () => {
    branchResult.mockResolvedValue({ data: { phone: "111", address: " Av. Sede 456 " }, error: null });
    const seller = await getSellerInfo("sede-1");
    expect(seller.branchAddress).toBe("Av. Sede 456");
    expect(seller.direccion).not.toBe(seller.branchAddress);
    expect(seller.email).toBe("empresa@example.com");
  });
  it.each([null, "", "   "])("omits an unconfigured branch address: %s", async (address) => {
    branchResult.mockResolvedValue({ data: { phone: "111", address }, error: null });
    expect((await getSellerInfo("sede-1")).branchAddress).toBeUndefined();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockImplementation((table: string) => {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: table === "branches" ? branchEq : vi.fn().mockReturnThis(),
        single: table === "branches" ? branchResult : vi.fn().mockResolvedValue({
          data: table === "organizations" ? { phone: "999111222", email: "empresa@example.com" } : {},
          error: null,
        }),
      };
      if (table === "branches") branchEq.mockReturnValue(query);
      return query;
    });
  });

  it("uses the document branch phone and preserves the organization email", async () => {
    branchResult.mockResolvedValue({ data: { phone: " 987654321 " }, error: null });
    const seller = await getSellerInfo("sede-1");
    expect(seller.phone).toBe("987654321");
    expect(seller.email).toBe("empresa@example.com");
    expect(branchEq).toHaveBeenCalledWith("organization_id", "org");
    expect(branchEq).toHaveBeenCalledWith("id", "sede-1");
  });

  it.each([null, "", "   "])("does not substitute another phone when the branch phone is %s", async (phone) => {
    branchResult.mockResolvedValue({ data: { phone }, error: null });
    expect((await getSellerInfo("sede-1")).phone).toBe("");
  });

  it("refreshes the phone when switching branches or updating a branch", async () => {
    branchResult.mockResolvedValueOnce({ data: { phone: "111" }, error: null })
      .mockResolvedValueOnce({ data: { phone: "222" }, error: null })
      .mockResolvedValueOnce({ data: { phone: "333" }, error: null });
    expect((await getSellerInfo("sede-1")).phone).toBe("111");
    expect((await getSellerInfo("sede-2")).phone).toBe("222");
    expect((await getSellerInfo("sede-1")).phone).toBe("333");
  });

  it("propagates a branch lookup failure instead of printing the organization phone", async () => {
    branchResult.mockResolvedValue({ data: null, error: new Error("No disponible") });
    await expect(getSellerInfo("sede-1")).rejects.toThrow("No disponible");
  });

  it("preserves the existing behavior for documents without a branch context", async () => {
    expect((await getSellerInfo()).phone).toBe("999111222");
    expect(from).not.toHaveBeenCalledWith("branches");
  });
});
