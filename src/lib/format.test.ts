import { describe, expect, it } from "vitest";
import { formatDate, formatDateLong } from "./format";

describe("fechas de comprobantes sin hora", () => {
  it.each(["2026-10-17", "2026-10-18", "2026-11-01", "2027-01-01"])(
    "conserva el día de emisión %s",
    (value) => {
      const [year, month, day] = value.split("-").map(Number);
      const expected = new Date(year, month - 1, day);
      expect(formatDate(value)).toBe(expected.toLocaleDateString("es-PE", {
        year: "numeric", month: "short", day: "numeric",
      }));
      expect(formatDateLong(value)).toBe(expected.toLocaleDateString("es-PE", {
        year: "numeric", month: "long", day: "numeric",
      }));
    },
  );

  it("conserva la conversión local de valores que sí incluyen hora y zona", () => {
    const value = "2026-10-18T02:00:00Z";
    expect(formatDate(value)).toBe(new Date(value).toLocaleDateString("es-PE", {
      year: "numeric", month: "short", day: "numeric",
    }));
  });
});
