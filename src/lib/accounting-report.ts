import type { Invoice } from './types';

export interface AccountingInvoice extends Invoice {
  accounting_identity: { name: string; document_type: string; document_number: string } | null;
  accounting_currency: string | null;
  accounting_payment_condition: string | null;
  accounting_environment: 'beta' | 'production' | null;
  cancellation_reason: string | null;
  reference: { serie: string; correlativo: number; issue_date: string } | null;
}

export function inspectAccountingInvoice(invoice: AccountingInvoice) {
  const issues: string[] = [];
  const base = invoice.gravada_cents + invoice.exonerada_cents + invoice.inafecta_cents + invoice.exportacion_cents;
  if (base + invoice.igv_cents !== invoice.total_cents) issues.push('Las bases más IGV no coinciden con el total');
  if (!invoice.accounting_identity) issues.push('Receptor histórico no conservado: requiere recuperación con evidencia');
  else if (!invoice.accounting_identity.name || !invoice.accounting_identity.document_number || !invoice.accounting_identity.document_type) issues.push('Receptor histórico incompleto');
  if (!invoice.accounting_currency) issues.push('Moneda histórica no conservada');
  if (!invoice.accounting_payment_condition) issues.push('Condición de pago no documentada');
  if (invoice.accounting_payment_condition === 'CREDITO' && !invoice.due_date) issues.push('Crédito sin fecha de vencimiento');
  if (!invoice.payment_method) issues.push('Método de pago no registrado');
  if (invoice.invoice_type.startsWith('nota_') && !invoice.reference) issues.push('Falta el comprobante de referencia');
  if (invoice.status === 'cancelled' && !invoice.cancellation_reason) issues.push('Motivo de anulación no registrado');
  if (!invoice.accounting_environment) issues.push('Entorno SUNAT del envío no documentado');
  if (invoice.accounting_environment === 'beta') issues.push('Comprobante de prueba: no representa aceptación en producción');
  if (!invoice.items?.length) issues.push('Comprobante sin detalle');
  else {
    const total = invoice.items.reduce((sum,item) => sum + item.line_total_cents,0);
    const igv = invoice.items.reduce((sum,item) => sum + item.igv_cents,0);
    if (total !== invoice.total_cents || igv !== invoice.igv_cents) issues.push('El detalle no concilia con la cabecera');
  }
  const sunat = invoice.sunat_accepted_at && invoice.sunat_cdr_path
    ? `Aceptación con evidencia · ${invoice.accounting_environment || 'entorno desconocido'}`
    : invoice.sunat_error_code ? `Error SUNAT ${invoice.sunat_error_code}` : 'Sin aceptación acreditada';
  return { invoice, issues, base, sunat };
}

export const ACCOUNTING_PENDING_RULES = [
  'Significado de MontoSubTotal: confirmar si corresponde a la base sin IGV.',
  'MontoDescuento y MontoDescuentoIgv: confirmar definición y redondeo.',
  'Notas de crédito: confirmar signo de los importes.',
  'AplicadoEn: confirmar significado y cuándo se completa.',
  'Confirmar qué conceptos especiales no aplican antes de exportarlos en cero: ISC, anticipos, operaciones gratuitas, cargos, ICBPER, detracciones, percepciones y retenciones.',
];
