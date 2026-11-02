import * as XLSX from 'xlsx';
import { groupProfit, profitAverages, PROFIT_RULES, type ProfitLine } from './product-profit';

export function profitWorkbook(lines: ProfitLine[], metadata: Record<string,string>) {
  const groups = groupProfit(lines);
  const book = XLSX.utils.book_new();
  const amount = (value: number | null) => value === null ? null : value / 100;
  const summary = [
    ['Código','Producto','Unidad','Moneda','Unidades netas','Venta neta','Precio promedio','Costo promedio','Costo conocido','Utilidad por unidad','Utilidad calculable','Margen calculable %','Líneas pendientes','Líneas estimadas'],
    ...groups.map(g => { const a=profitAverages(g); const known=g.lines.some(l=>l.quality!=='pending'); return [g.sku,g.name,g.unit,g.currency,g.quantity,g.currency==='Sin moneda'?null:amount(g.revenue),amount(a.price),amount(a.cost),known?amount(g.cost):null,amount(a.profit),known?amount(g.profit):null,a.margin===null?null:a.margin*100,g.pending,g.estimated]; }),
  ];
  const detail = [
    ['Comprobante','Fecha emisión','Código','Producto','Moneda','Unidades netas','Venta neta','Costo','Operación','Calidad costo','Procedencia','Canal','Sede venta ID','Almacén ID','Entorno','Línea ID','Línea original ID'],
    ...lines.map(l=>[l.document,l.date,l.sku,l.name,l.currency,l.quantity,amount(l.revenue),amount(l.cost),l.operation,l.quality,l.cost_source,l.channel,l.branch_id,l.stock_branch_id,l.environment||'desconocido',l.id,l.reference_item]),
  ];
  const observations = [
    ['Concepto','Detalle'], ...Object.entries(metadata), ...PROFIT_RULES.map(r=>['Criterio',r]),
    ...lines.filter(l=>l.quality!=='historical'||l.operation==='excluded'||l.environment!=='production')
      .map(l=>[l.document,`${l.name}: ${l.cost_source}; operación ${l.operation}; entorno ${l.environment||'desconocido'}`]),
  ];
  for (const [name,rows] of [['Utilidad por producto',summary],['Detalle de operaciones',detail],['Observaciones y criterios',observations]] as const) {
    const sheet=XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols']=rows[0].map((_,i)=>({wch:name==='Observaciones y criterios'?(i?110:25):i===1||i===3?35:22}));
    sheet['!autofilter']={ref:sheet['!ref']!};
    for(const address of Object.keys(sheet)) if(sheet[address]?.t==='n') sheet[address].z='0.00';
    XLSX.utils.book_append_sheet(book,sheet,name);
  }
  return book;
}
export function downloadProfit(lines: ProfitLine[], metadata: Record<string,string>) {
  XLSX.writeFile(profitWorkbook(lines,metadata),`Utilidad_productos_${metadata.Desde}_${metadata.Hasta}.xlsx`,{compression:true});
}
