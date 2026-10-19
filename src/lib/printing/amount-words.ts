const UNITS = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const TEENS = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const TENS_ = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const HUNDREDS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function numberToWords(n: number): string {
  if (n === 0) return "CERO";
  if (n === 100) return "CIEN";
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 30) return n === 20 ? "VEINTE" : "VEINTI" + UNITS[n - 20];
  if (n < 100) {
    const tens = TENS_[Math.floor(n / 10)];
    const unit = n % 10;
    return unit ? `${tens} Y ${UNITS[unit]}` : tens;
  }
  if (n < 1000) {
    const hundred = HUNDREDS[Math.floor(n / 100)];
    const rest = n % 100;
    return rest ? `${hundred} ${numberToWords(rest)}` : hundred;
  }
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    const thousandsWord = thousands === 1 ? "MIL" : `${numberToWords(thousands)} MIL`;
    return rest ? `${thousandsWord} ${numberToWords(rest)}` : thousandsWord;
  }
  if (n < 1_000_000_000) {
    const millions = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const millionsWord = millions === 1 ? "UN MILLON" : `${numberToWords(millions)} MILLONES`;
    return rest ? `${millionsWord} ${numberToWords(rest)}` : millionsWord;
  }
  return String(n);
}

export function centsToText(cents: number): string {
  const soles = Math.floor(Math.abs(cents) / 100);
  const centimos = Math.abs(cents) % 100;
  const solesText = numberToWords(soles);
  const centimosText = centimos > 0 ? `CON ${String(centimos).padStart(2, "0")}/100` : "CON 00/100";
  return `${solesText} SOLES ${centimosText}`;
}
