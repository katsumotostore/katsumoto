import { describe,it,expect } from 'vitest';
import * as XLSX from 'xlsx';
import { ACCOUNTING_HEADERS,buildAccountingDraft,accountingWorkbook } from './accounting-export';
import type { AccountingInvoice } from './accounting-report';

const sample={id:'id',serie:'F001',correlativo:3,issue_date:'2026-10-31',invoice_type:'factura',status:'issued',gravada_cents:9000,exonerada_cents:0,inafecta_cents:0,exportacion_cents:0,igv_cents:1620,total_cents:10620,igv_rate:0.18,items:[{discount_cents:1180,tax_affectation:'gravado',line_total_cents:10620,igv_cents:1620}],accounting_identity:{name:'Cliente',document_type:'dni',document_number:'00123456'},accounting_currency:'PEN',accounting_payment_condition:'CONTADO',payment_method:'cash'} as AccountingInvoice;
describe('Excel contable preliminar',()=>{
  it('exports exactly 35 columns and separates discounts without subtracting twice',()=>{const {rows}=buildAccountingDraft([sample]);expect(ACCOUNTING_HEADERS).toHaveLength(35);expect(rows[0]).toHaveLength(35);expect(rows[0][7]).toBe(10);expect(rows[0][34]).toBe(1.8);expect(rows[0][8]).toBe(90);expect(rows[0][12]).toBe(106.2);});
  it('leaves unrecorded concepts blank rather than manufacturing zeros',()=>{const r=buildAccountingDraft([sample]).rows[0];for(const i of [10,11,16,25,26,27,28,29])expect(r[i]).toBeNull();});
  it('documents current customer fallback and preserves unknown currency',()=>{const d=buildAccountingDraft([{...sample,accounting_identity:null,accounting_currency:null,customer:{id:'customer-id',name:'Actual',document_type:'DNI',document_number:'00123456'} as AccountingInvoice['customer']}]);expect(d.rows[0][4]).toBe('Actual');expect(d.rows[0][18]).toBe('');expect(d.observations[0][6]).toContain('ficha actual');});
  it('uses positive credit note values without changing the source',()=>{const inv={...sample,invoice_type:'nota_credito' as const,total_cents:-10620};expect(buildAccountingDraft([inv]).rows[0][12]).toBe(106.2);expect(inv.total_cents).toBe(-10620);});
  it('retains original cancelled amounts and warns not to sum them',()=>{const d=buildAccountingDraft([{...sample,status:'cancelled'}]);expect(d.rows[0][12]).toBe(106.2);expect(d.observations[0][6]).toContain('excluir');});
  it('preserves identifier text and never turns customer text into Excel formulas',()=>{const d=buildAccountingDraft([{...sample,accounting_identity:{...sample.accounting_identity!,name:'=1+1'}}]);const b=accountingWorkbook(d,{Version:'prueba'});const roundtrip=XLSX.read(XLSX.write(b,{type:'array',bookType:'xlsx'}),{type:'array'});expect(roundtrip.Sheets['Reporte Contable'].G2.v).toBe('00123456');expect(roundtrip.Sheets['Reporte Contable'].E2.f).toBeUndefined();expect(roundtrip.SheetNames).toEqual(['Reporte Contable','Observaciones','Criterios']);});
});
