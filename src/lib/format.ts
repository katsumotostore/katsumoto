import type { Cents } from "./types";
import { parseISO } from "date-fns";

/** Convierte centavos a string formateado en PEN (Soles) */
export function formatCents(cents: Cents): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Convierte un valor en soles a centavos */
export function toCents(soles: number): Cents {
  return Math.round(soles * 100);
}

/** Convierte centavos a soles (para inputs) */
export function toSoles(cents: Cents): number {
  return cents / 100;
}

/** Formatea fecha en formato peruano */
export function formatDate(dateString: string): string {
  return parseISO(dateString).toLocaleDateString("es-PE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Formatea fecha y hora en formato peruano */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString("es-PE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateLong(dateString: string): string {
  return parseISO(dateString).toLocaleDateString("es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// ==========================================
// Validaciones peruanas (SUNAT)
// ==========================================

/** Valida que un RUC tenga 11 dígitos numéricos */
export function isValidRUC(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc) || !/^[12]\d{10}$/.test(ruc)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = ruc.split("").map(Number);
  const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? 0 : 11 - remainder;
  return checkDigit === digits[10];
}

/** Valida que un DNI tenga 8 dígitos numéricos */
export function isValidDNI(dni: string): boolean {
  return /^\d{8}$/.test(dni);
}

/** Genera el número de comprobante en formato SUNAT: Serie-Correlativo */
export function formatInvoiceNumber(serie: string, correlativo: number): string {
  return `${serie}-${String(correlativo).padStart(6, "0")}`;
}

