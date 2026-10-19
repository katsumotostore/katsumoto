import { describe, it, expect, vi } from "vitest";
import { generateInvoice } from "../generate";
import { sampleInvoice, seller } from "./fixtures";
import { centsToText } from "../amount-words";
import { buildTextReceipt, buildEscposReceipt } from "../thermal/receipt-builder";

vi.mock("../load-image", () => ({ loadPrintLogo: vi.fn().mockResolvedValue(null) }));

describe("print documents", () => {
  it.each(["a4", "thermal-58mm", "thermal-80mm"] as const)("prints a separate branch address in %s", async (format) => {
    const contact = { ...seller, branchAddress: "Av. Sede 456 - Local 2" };
    const doc = await generateInvoice(sampleInvoice(), contact, { format, action: "preview" });
    const content = doc.internal.pages.flat().join("\n");
    expect(content).toContain("Direccion de sede:");
    expect(content).toContain("Av. Sede 456");
    expect(content).toContain("Domicilio fiscal:");
  });
  it.each([58, 80] as const)("includes the branch address in native %i mm receipts", (paperWidth) => {
    const contact = { ...seller, branchAddress: "Av. Sede 456" };
    const text = buildTextReceipt(sampleInvoice(), contact, { paperWidth });
    expect(text).toContain("Av. Sede 456");
    const bytes = buildEscposReceipt(sampleInvoice(), contact, { paperWidth });
    expect(new TextDecoder().decode(bytes)).toContain("Av. Sede 456");
  });
  it.each(["thermal-58mm", "thermal-80mm"] as const)("preserves the actual paper width: %s", async (format) => {
    const doc = await generateInvoice(sampleInvoice(), seller, { format, action: "preview" });
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(format === "thermal-80mm" ? 80 : 58, 1);
    expect(doc.internal.pageSize.getHeight()).toBeGreaterThan(150);
    expect(doc.getNumberOfPages()).toBe(1);
  });
  it("paginates long A4 documents and long notes", async () => {
    const invoice = sampleInvoice(45);
    invoice.notes = "Observacion extensa de muestra. ".repeat(300) + "FIN DE OBSERVACIONES";
    const doc = await generateInvoice(invoice, seller, { action: "preview" });
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    expect(doc.output()).toContain("FIN DE OBSERVACIONES");
    expect(doc.output()).toContain(`Pagina ${doc.getNumberOfPages()} de ${doc.getNumberOfPages()}`);
  });
  it.each(["factura", "boleta", "nota_credito", "nota_debito"] as const)("renders %s without changing amounts", async (type) => {
    const invoice = { ...sampleInvoice(), invoice_type: type, descripcion_motivo: "Ajuste de precio" };
    const before = JSON.stringify(invoice);
    const doc = await generateInvoice(invoice, seller, { action: "preview" });
    expect(doc.getNumberOfPages()).toBe(1);
    expect(JSON.stringify(invoice)).toBe(before);
    expect(doc.output()).toContain("Ajuste de precio");
  });
  it("writes fractional soles as two numeric digits", () => {
    expect(centsToText(13505)).toBe("CIENTO TREINTA Y CINCO SOLES CON 05/100");
  });
  it("splits very long thermal receipts into valid pages", async () => {
    const doc = await generateInvoice(sampleInvoice(100), seller, { format: "thermal-58mm", action: "preview" });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    for (let page = 1; page <= doc.getNumberOfPages(); page++) {
      doc.setPage(page);
      expect(doc.internal.pageSize.getWidth()).toBeCloseTo(58, 1);
      expect(doc.internal.pageSize.getHeight()).toBeLessThanOrEqual(1000);
    }
  });
  it("prints unsigned documents without requiring a QR or certificate", async () => {
    const invoice = { ...sampleInvoice(), sunat_hash: null };
    const doc = await generateInvoice(invoice, seller, { format: "thermal-80mm", action: "preview" });
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
