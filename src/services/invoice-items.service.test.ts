import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, select, eq, order, single } = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), single: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from }, getCurrentOrgId: () => "org" }));
vi.mock("@/services/audit.service", () => ({ auditService: { log: vi.fn() } }));
import { invoiceService } from "./invoice.service";

describe("invoice product details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = { select, eq, order, single };
    from.mockReturnValue(query);
    select.mockReturnValue(query);
    eq.mockReturnValue(query);
    order.mockResolvedValue({ data: [], error: null });
    single.mockResolvedValue({ data: null, error: null });
  });

  it.each(["all", "branch", "detail", "linked"])("loads complete item fields for %s", async (scope) => {
    if (scope === "all") await invoiceService.getAll();
    if (scope === "branch") await invoiceService.getByBranch("branch");
    if (scope === "detail") await invoiceService.getById("invoice");
    if (scope === "linked") {
      eq.mockReturnValueOnce({ eq }).mockResolvedValueOnce({ data: [], error: null });
      await invoiceService.getLinkedCreditNotes("invoice");
    }
    expect(select).toHaveBeenCalledWith(expect.stringContaining("items:invoice_items(*)"));
    expect(eq).toHaveBeenCalledWith("organization_id", "org");
  });

  it.each(["factura", "nota_credito", "nota_debito"])("preserves product details for %s", async (invoiceType) => {
    const invoices = [{ invoice_type: invoiceType, items: [{ product_name: "Aceite 2T Castrol 500ml", quantity: 2 }] }];
    order.mockResolvedValue({ data: invoices, error: null });
    expect(await invoiceService.getAll()).toEqual(invoices);
  });
});
