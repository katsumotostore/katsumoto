import * as XLSX from 'xlsx';
import { inspectAccountingInvoice, type AccountingInvoice } from './accounting-report';

export const ACCOUNTING_HEADERS = ['FechaEmisionDoc','TipoDocDescripcion','SerieDescripcion','CorrelativoDocumento','ReceptorRazonSocial','ReceptorTipoDocumento','ReceptorNumeroDocumento','MontoDescuento','MontoSubTotal','MontoIGV','MontoISC','TotalAdelantos','MontoTotal','OperacionesGravadas','OperacionesInafectas','OperacionesExoneradas','OperacionesGratuitas','OperacionesExportadas','MonedaDescripcion','SerieDocumentoDestino','CorrelativoDocumentoDestino','FechaEmisionDestinoFormateada','AplicadoEn','EstadoDescripcion','EstadoSunatDescripcion','OtrosCargosSumatoria','SumatoriaIcbper','MontoDetracciones','MontoPercepciones','MontoRetenciones','FechaVencimiento','CondicionPago','MotivoAnulacion','MetodoPago','MontoDescuentoIgv'];
const types = {factura:'FACTURA',boleta:'BOLETA DE VENTA',nota_credito:'NOTA DE CREDITO',nota_debito:'NOTA DE DEBITO'};
const methods:Record<string,string> = {cash:'EFECTIVO',debit_card:'TARJETA DE DEBITO',credit_card:'TARJETA DE CREDITO',transfer:'TRANSFERENCIA',yape:'YAPE',plin:'PLIN'};
const date = (value?:string|null) => value ? value.slice(0,10).split('-').reverse().join('/') : '';
const money = (value:number) => Math.abs(value)/100;
export const ACCOUNTING_DRAFT_RULES = [
  'BORRADOR PARA REVISION DEL CONTADOR. No apto para carga directa en SUNAT ni importación definitiva.',
  'Versión propuesta 0.2: subtotal neto sin IGV, después de descuentos; importes positivos por documento, incluidas notas.',
  'Descuento separado en base e IGV; IGV del descuento estimado por línea con la tasa histórica de cabecera. Validar contra XML.',
  'Anulados conservan importes originales para control. No sumar la columna Total como ventas netas.',
  'Campos especiales vacíos significan no documentado, no cero: ISC, adelantos, gratuitas, cargos, ICBPER, detracciones, percepciones y retenciones.',
  'AplicadoEn pendiente del diccionario del receptor; no se asigna un significado supuesto.',
  'Receptor de ficha actual usado solo cuando falta copia histórica; cada caso se identifica en Observaciones.',
  'Moneda histórica ausente permanece vacía. No convertir ni sumar importes de moneda desconocida.',
  'Condición de pago existente fue inferida del método; es provisional y debe validarse por fecha y saldo pendiente al emitir.',
  'Estado SUNAT incluye entorno beta/desconocido y no se deduce del estado pagado. Verificar bajas por separado.',
];

export function buildAccountingDraft(invoices:AccountingInvoice[]) {
  const observations:(string|number)[][] = [];
  const rows = invoices.map((inv,index) => {
    const check=inspectAccountingInvoice(inv), issues=[...check.issues];
    const customer=inv.accounting_identity||inv.customer;
    let discount:number|null=inv.items?.length?0:null, discountTax:number|null=discount;
    for(const item of inv.items||[]) {
      if(discount===null||discountTax===null)break;
      if(!Number.isFinite(item.discount_cents)){discount=null;discountTax=null;issues.push('Descuento del detalle no disponible');break;}
      const gross=Math.abs(item.discount_cents);
      let tax=0;
      if(item.tax_affectation==='gravado'&&gross>0){
        if(!Number.isFinite(inv.igv_rate)||inv.igv_rate<=0||inv.igv_rate>1){discount=null;discountTax=null;issues.push('Tasa histórica inválida para separar descuento');break;}
        tax=Math.round(gross*inv.igv_rate/(1+inv.igv_rate));
        issues.push('IGV del descuento calculado para revisión; contrastar con XML');
      }
      discount+=gross-tax;discountTax+=tax;
    }
    if(!inv.accounting_identity)issues.push('Nombre/documento exportados desde ficha actual, sin garantía histórica');
    if(inv.accounting_payment_condition)issues.push('Condición de pago inferida: verificar contado/crédito');
    if(inv.status==='cancelled')issues.push('Anulado: importes de control, excluir del total de ventas vigentes; verificar baja');
    const row = [date(inv.issue_date),types[inv.invoice_type],inv.serie,String(inv.correlativo),customer?.name||'',customer?.document_type?.toUpperCase()||'',customer?.document_number||'',
      discount===null?null:money(discount),money(check.base),money(inv.igv_cents),null,null,money(inv.total_cents),money(inv.gravada_cents),money(inv.inafecta_cents),money(inv.exonerada_cents),null,money(inv.exportacion_cents),
      inv.accounting_currency==='PEN'?'SOLES':inv.accounting_currency||'',inv.reference?.serie||'',inv.reference?String(inv.reference.correlativo):'',date(inv.reference?.issue_date),'',
      inv.status==='cancelled'?'ANULADO':'EMITIDO',check.sunat,null,null,null,null,null,date(inv.due_date),inv.accounting_payment_condition||'',inv.cancellation_reason||'',methods[inv.payment_method||'']||'',discountTax===null?null:money(discountTax)];
    observations.push([index+2,`${inv.serie}-${inv.correlativo}`,inv.id,inv.accounting_environment||'DESCONOCIDO',inv.status,inv.accounting_identity?'COPIA HISTORICA':'FICHA ACTUAL',... [Array.from(new Set(issues)).join(' | ')||'Sin diferencias detectadas; revisar reglas generales']]);
    return row;
  });
  return {rows,observations};
}

export function accountingWorkbook(draft:ReturnType<typeof buildAccountingDraft>,metadata:Record<string,string>) {
  const book=XLSX.utils.book_new();
  book.Props={Title:'BORRADOR - Reporte contable para revisión',Subject:'No apto para carga SUNAT'};
  const report=XLSX.utils.aoa_to_sheet([ACCOUNTING_HEADERS,...draft.rows]);
  report['!autofilter']={ref:`A1:AI${draft.rows.length+1}`};
  report['!cols']=ACCOUNTING_HEADERS.map((_,i)=>({wch:i===4?42:i===24?50:24}));
  for(const [address,cell] of Object.entries(report))if(!address.startsWith('!')&&cell.t==='n')cell.z='0.00';
  XLSX.utils.book_append_sheet(book,report,'Reporte Contable');
  const review=XLSX.utils.aoa_to_sheet([['Fila Excel','Comprobante','ID interno','Entorno SUNAT','Estado interno','Origen receptor','Observaciones'],...draft.observations]);
  review['!cols']=[{wch:12},{wch:24},{wch:38},{wch:20},{wch:18},{wch:22},{wch:110}];
  review['!autofilter']={ref:`A1:G${draft.observations.length+1}`};
  XLSX.utils.book_append_sheet(book,review,'Observaciones');
  const rules=XLSX.utils.aoa_to_sheet([['BORRADOR CONTABLE','Reglas y alcance'],...Object.entries(metadata),...ACCOUNTING_DRAFT_RULES.map((rule,i)=>[`Regla ${i+1}`,rule])]);
  rules['!cols']=[{wch:28},{wch:120}];
  XLSX.utils.book_append_sheet(book,rules,'Criterios');
  return book;
}

export function downloadAccountingDraft(book:XLSX.WorkBook,filename:string) {
  XLSX.writeFile(book,filename,{compression:true});
}
