import { describe,it,expect } from 'vitest';
import { inspectAccountingInvoice,type AccountingInvoice } from './accounting-report';

function invoice(extra:Partial<AccountingInvoice>={}):AccountingInvoice {
  return {gravada_cents:10000,exonerada_cents:0,inafecta_cents:0,exportacion_cents:0,igv_cents:1800,total_cents:11800,
    accounting_identity:{name:'Cliente',document_type:'ruc',document_number:'20123456789'},accounting_currency:'PEN',accounting_payment_condition:'CONTADO',accounting_environment:'production',payment_method:'cash',invoice_type:'factura',status:'issued',
    items:[{line_total_cents:11800,igv_cents:1800}],...extra} as AccountingInvoice;
}
describe('revisión contable',()=>{
  it('uses net bases rather than the legacy tax-inclusive subtotal',()=>{const r=inspectAccountingInvoice(invoice({subtotal_cents:11800}));expect(r.base).toBe(10000);expect(r.issues).toEqual([]);});
  it('does not treat paid as accepted by SUNAT',()=>{expect(inspectAccountingInvoice(invoice({status:'paid'})).sunat).toBe('Sin aceptación acreditada');});
  it('does not fabricate historical identity from current customer',()=>{expect(inspectAccountingInvoice(invoice({accounting_identity:null})).issues.join()).toContain('histórico');});
  it('distinguishes beta acceptance',()=>{const r=inspectAccountingInvoice(invoice({accounting_environment:'beta',sunat_accepted_at:'2026-10-31',sunat_cdr_path:'cdr.zip'}));expect(r.sunat).toContain('beta');expect(r.issues.join()).toContain('prueba');});
  it('requires a note reference',()=>{expect(inspectAccountingInvoice(invoice({invoice_type:'nota_credito',reference:null})).issues.join()).toContain('referencia');});
  it('checks header and item reconciliation',()=>{const r=inspectAccountingInvoice(invoice({total_cents:12000}));expect(r.issues).toHaveLength(2);});
  it('requires credit maturity and cancellation reason',()=>{const r=inspectAccountingInvoice(invoice({accounting_payment_condition:'CREDITO',due_date:null,status:'cancelled'}));expect(r.issues.join()).toContain('vencimiento');expect(r.issues.join()).toContain('anulación');});
});
