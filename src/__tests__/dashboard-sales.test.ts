import { describe, it, expect, vi } from "vitest";
import { computeDashboardSales, getDateKey } from "@/hooks/useDashboardSales";
import type { Invoice } from "@/lib/types";

vi.mock("@/hooks/useInvoices", () => ({ useInvoices: vi.fn() }));

function inv(overrides: Partial<Invoice> & { issue_date: string }): Invoice {
  return {
    id: crypto.randomUUID(), organization_id: "org-1", number: "F001-1",
    serie: "F001", correlativo: 1, invoice_type: "factura",
    customer_id: "c1", branch_id: "b1", status: "issued",
    due_date: null, subtotal_cents: 10000, gravada_cents: 8475,
    exonerada_cents: 0, inafecta_cents: 0, exportacion_cents: 0,
    igv_rate: 0.18, igv_cents: 1525, total_cents: 10000,
    notes: null, created_by: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("computeDashboardSales", () => {
  it("sin invoices → todo 0, trend 7 días vacíos", () => {
    const refDate = new Date("2026-07-15T12:00:00-05:00");
    const result = computeDashboardSales([], refDate);
    expect(result.todaySales).toBe(0);
    expect(result.todayCount).toBe(0);
    expect(result.monthSales).toBe(0);
    expect(result.monthCount).toBe(0);
    expect(result.trend).toHaveLength(7);
    expect(result.trend.every(d => d.total === 0 && d.count === 0)).toBe(true);
  });

  it("filtra draft y cancelled", () => {
    const refDate = new Date("2026-07-15T12:00:00-05:00");
    const invoices = [
      inv({ issue_date: "2026-07-15", status: "draft", total_cents: 5000 }),
      inv({ issue_date: "2026-07-15", status: "cancelled", total_cents: 3000 }),
      inv({ issue_date: "2026-07-15", status: "issued", total_cents: 10000 }),
    ];
    const result = computeDashboardSales(invoices, refDate);
    expect(result.todayCount).toBe(1);
    expect(result.todaySales).toBe(10000);
  });

  it("ventas de hoy correctas", () => {
    const refDate = new Date("2026-07-15T12:00:00-05:00");
    const invoices = [
      inv({ issue_date: "2026-07-15", total_cents: 10000 }),
      inv({ issue_date: "2026-07-15", total_cents: 20000 }),
      inv({ issue_date: "2026-07-14", total_cents: 5000 }), // ayer
    ];
    const result = computeDashboardSales(invoices, refDate);
    expect(result.todayCount).toBe(2);
    expect(result.todaySales).toBe(30000);
  });

  it("ventas del mes correctas", () => {
    const refDate = new Date("2026-07-15T12:00:00-05:00");
    const invoices = [
      inv({ issue_date: "2026-07-15", total_cents: 10000 }),
      inv({ issue_date: "2026-07-01", total_cents: 5000 }),
      inv({ issue_date: "2026-06-30", total_cents: 99999 }), // mes anterior
    ];
    const result = computeDashboardSales(invoices, refDate);
    expect(result.monthCount).toBe(2);
    expect(result.monthSales).toBe(15000);
  });

  it("trend: agrupa por día, incluye días sin ventas", () => {
    const refDate = new Date("2026-07-15T12:00:00-05:00");
    const invoices = [
      inv({ issue_date: "2026-07-15", total_cents: 10000 }),
      inv({ issue_date: "2026-07-15", total_cents: 5000 }),
      inv({ issue_date: "2026-07-13", total_cents: 30000 }),
    ];
    const result = computeDashboardSales(invoices, refDate);
    expect(result.trend).toHaveLength(7);

    const day15 = result.trend.find(d => d.date === "2026-07-15");
    expect(day15?.total).toBe(15000);
    expect(day15?.count).toBe(2);

    const day13 = result.trend.find(d => d.date === "2026-07-13");
    expect(day13?.total).toBe(30000);

    const day10 = result.trend.find(d => d.date === "2026-07-10");
    expect(day10?.total).toBe(0);
  });

  it("maneja fecha con timestamp ISO", () => {
    const refDate = new Date("2026-07-15T12:00:00-05:00");
    const invoices = [
      inv({ issue_date: "2026-07-15T10:30:00.000Z", total_cents: 10000 }),
    ];
    const result = computeDashboardSales(invoices, refDate);
    expect(getDateKey("2026-07-15T10:30:00.000Z")).toBe("2026-07-15");
    expect(result.todayCount).toBe(1);
  });

  it("pagos accepted y paid también cuentan", () => {
    const refDate = new Date("2026-07-15T12:00:00-05:00");
    const invoices = [
      inv({ issue_date: "2026-07-15", status: "accepted", total_cents: 10000 }),
      inv({ issue_date: "2026-07-15", status: "paid", total_cents: 20000 }),
    ];
    const result = computeDashboardSales(invoices, refDate);
    expect(result.todayCount).toBe(2);
  });
});
