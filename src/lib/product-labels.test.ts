import { describe, expect, it } from "vitest";
import { barcodeStatus } from "./product-labels";
import { generateBarcode } from "./barcode";

describe("label selection", () => {
  it("allows missing codes to be distinguished from invalid codes", () => {
    expect(barcodeStatus({ barcode: "" }, [])).toBe("missing");
    expect(barcodeStatus({ barcode: " " }, [])).toBe("missing");
    expect(barcodeStatus({ barcode: "123" }, [])).toBe("review");
  });
  it("marks duplicate codes for review", () => {
    const p = { barcode: generateBarcode(1) };
    expect(barcodeStatus(p, [p])).toBe("ready");
    expect(barcodeStatus(p, [p, p])).toBe("review");
    expect(barcodeStatus(p, [p], true)).toBe("review");
  });
});
