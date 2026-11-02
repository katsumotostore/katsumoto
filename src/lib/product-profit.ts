export interface ProfitLine {
  id: string; product_id: string | null; sku: string | null; name: string;
  category: string | null; unit: string | null; document: string; invoice_id: string;
  date: string; type: string; channel: string | null; branch_id: string;
  stock_branch_id: string | null; currency: string | null; environment: string | null;
  operation: 'sale' | 'return' | 'adjustment' | 'unassigned' | 'excluded';
  quality: 'historical' | 'estimated' | 'pending'; quantity: number;
  revenue: number; cost: number | null; cost_source: string; reference_item: string | null;
  candidates?: Array<{id:string;name:string;quantity:number}>;
}
export interface ProfitResult { generated_at: string; lines: ProfitLine[] }
export interface ProfitSourceLine {
  id:string; product_id:string|null; product_sku:string|null; product_name:string; category:string;
  document:string; invoice_id:string; issue_date:string; invoice_type:string; sales_channel:string|null;
  branch_id:string; stock_branch_id:string|null; currency:string; units:number; revenue:number; cost:number|null;
  quality:'historical'|'estimated'|'pending'|'pending_adjustment'; effect:'return'|'price'|null;
  candidates:Array<{id:string;name:string;quantity:number}>; environment?:string|null; unit?:string|null; reference_item?:string|null;
}
export function normalizeProfit(data:{generated_at:string;lines:ProfitSourceLine[]}):ProfitResult {
  return {generated_at:data.generated_at,lines:data.lines.map(l=>({
    id:l.id,product_id:l.product_id,sku:l.product_sku,name:l.product_name,category:l.category,unit:l.unit||null,
    document:l.document,invoice_id:l.invoice_id,date:l.issue_date,type:l.invoice_type,channel:l.sales_channel,
    branch_id:l.branch_id,stock_branch_id:l.stock_branch_id,currency:l.currency==='SIN MONEDA'?null:l.currency,
    environment:l.environment||null,quantity:l.quality==='pending_adjustment'?0:l.units,revenue:l.revenue,
    cost:l.currency==='SIN MONEDA'?null:l.cost,quality:l.quality==='pending_adjustment'||l.currency==='SIN MONEDA'?'pending':l.quality,
    operation:l.quality==='pending_adjustment'?'unassigned':l.effect==='return'?'return':l.effect==='price'?'adjustment':'sale',
    cost_source:l.quality==='historical'?'Costo histórico o ajuste de precio revisado':l.quality==='estimated'?'Costo comparable confirmado actual':l.quality==='pending_adjustment'?'Nota pendiente de vincular y clasificar':'Sin costo respaldado o moneda comparable',
    reference_item:l.reference_item||null,candidates:l.candidates,
  }))};
}
export interface ProfitGroup {
  key: string; sku: string; name: string; currency: string; unit: string;
  quantity: number; revenue: number; knownRevenue: number; cost: number;
  profit: number; pending: number; estimated: number; lines: ProfitLine[];
}
export function groupProfit(lines: ProfitLine[]): ProfitGroup[] {
  const groups = new Map<string, ProfitGroup>();
  for (const line of lines) {
    if (line.operation === 'excluded') continue;
    const key = `${line.product_id || `line:${line.id}`}|${line.currency || 'unknown'}`;
    const group = groups.get(key) || {
      key, sku: line.sku || 'Sin código', name: line.name, currency: line.currency || 'Sin moneda',
      unit: line.unit || '—', quantity: 0, revenue: 0, knownRevenue: 0, cost: 0, profit: 0,
      pending: 0, estimated: 0, lines: [],
    };
    group.quantity += line.operation==='unassigned'?0:line.quantity;
    group.revenue += line.operation==='unassigned'?0:line.revenue;
    if (line.cost !== null && line.quality !== 'pending' && line.currency) {
      group.knownRevenue += line.revenue;
      group.cost += line.cost;
      group.profit += line.revenue - line.cost;
    } else group.pending++;
    if (line.quality === 'estimated') group.estimated++;
    group.lines.push(line);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a,b) => b.profit-a.profit || a.name.localeCompare(b.name));
}
export function profitAverages(group: ProfitGroup) {
  const complete = !group.pending;
  return {
    price: group.currency !== 'Sin moneda' && group.quantity > 0 ? group.revenue / group.quantity : null,
    cost: complete && group.quantity > 0 ? group.cost / group.quantity : null,
    profit: complete && group.quantity > 0 ? group.profit / group.quantity : null,
    margin: group.knownRevenue > 0 ? group.profit / group.knownRevenue : null,
  };
}
export const PROFIT_RULES = [
  'Utilidad bruta: ingresos sin IGV, después de descuentos, menos costo. No incluye gastos generales.',
  'Los precios y costos promedio se ponderan por unidades netas. No es valorización de inventario por compras.',
  'Se excluyen borradores y anulados. Las notas sin revisar o con original anulado quedan pendientes fuera de los totales para evitar doble descuento.',
  'Notas sin vínculo inequívoco o sin tratamiento definido quedan pendientes. Revisar las observaciones.',
  'Solo las devoluciones identificadas reducen unidades y costo. Los descuentos reducen ingresos.',
  'El costo comparable se confirma explícitamente por producto y moneda. Cero solo se utiliza si fue confirmado.',
  'Los resultados con costos faltantes son parciales. Margen parcial = utilidad calculable / ingresos de líneas con costo.',
  'La estimación usa el costo comparable confirmado actual, solo si coincide con la moneda histórica. Nunca supone la moneda de documentos antiguos.',
  'Los entornos beta y desconocidos se identifican en el detalle. Este es un reporte de gestión, no una declaración tributaria.',
];
