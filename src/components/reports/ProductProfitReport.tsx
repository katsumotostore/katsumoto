import { useMemo, useState } from 'react';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useBranches } from '@/hooks/useBranches';
import { groupProfit, normalizeProfit, profitAverages, PROFIT_RULES, type ProfitResult, type ProfitLine } from '@/lib/product-profit';
import { downloadProfit } from '@/lib/product-profit-export';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { Download, Search, Loader2 } from 'lucide-react';
import { showSuccess } from '@/utils/toast';

const channels: Record<string,string>={pos:'Punto de venta',web_public:'Web pública',admin_online_pos:'POS tienda virtual',admin_manual:'Emisión manual'};
const qualities: Record<string,string>={historical:'Histórico',estimated:'Estimado',pending:'Pendiente'};
const operations: Record<string,string>={sale:'Venta',return:'Devolución',adjustment:'Ajuste de ingreso',unassigned:'Ajuste sin asignar',excluded:'Excluido: original anulado'};
const money=(cents:number|null)=>cents===null?'—':(cents/100).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
const decimal=(value:number)=>value.toLocaleString('es-PE',{maximumFractionDigits:4});
const selectClass='h-10 w-full rounded-md border bg-background px-3 text-sm';

export function ProductProfitReport() {
  const { user }=useAuth();
  const { selectedBranchId, getBranchName }=useBranches();
  const [from,setFrom]=useState(format(startOfMonth(new Date()),'yyyy-MM-dd'));
  const [to,setTo]=useState(format(new Date(),'yyyy-MM-dd'));
  const [estimate,setEstimate]=useState(false);
  const [channel,setChannel]=useState('all');
  const [category,setCategory]=useState('all');
  const [currency,setCurrency]=useState('all');
  const [quality,setQuality]=useState('all');
  const [search,setSearch]=useState('');
  const [result,setResult]=useState<ProfitResult|null>(null);
  const [requestKey,setRequestKey]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [page,setPage]=useState(0);
  const [expanded,setExpanded]=useState<string|null>(null);
  const key=JSON.stringify([from,to,selectedBranchId,estimate]);
  const stale=result!==null&&key!==requestKey;
  const filtered=useMemo(()=>result?.lines.filter(l=>
    (channel==='all'||l.channel===channel)&&(category==='all'||l.category===category)&&
    (currency==='all'||(l.currency||'unknown')===currency)&&(quality==='all'||l.quality===quality)&&
    `${l.sku||''} ${l.name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))||[],[result,channel,category,currency,quality,search]);
  const groups=useMemo(()=>groupProfit(filtered),[filtered]);
  const totals=useMemo(()=>[...new Set(groups.map(g=>g.currency))].map(c=>{
    const subset=groups.filter(g=>g.currency===c);
    return {currency:c,revenue:subset.reduce((s,g)=>s+g.revenue,0),cost:subset.reduce((s,g)=>s+g.cost,0),profit:subset.reduce((s,g)=>s+g.profit,0),
      pending:subset.reduce((s,g)=>s+g.pending,0),knownRevenue:subset.reduce((s,g)=>s+g.knownRevenue,0),known:subset.some(g=>g.lines.some(l=>l.quality!=='pending'))};
  }),[groups]);
  if (!user || !['owner','admin'].includes(user.role)) return <Card className="p-6">El reporte de costos y utilidad está disponible para propietarios y administradores.</Card>;
  async function consult() {
    setBusy(true);setError('');setPage(0);setExpanded(null);
    try {
      const {data,error:failure}=await supabase.rpc('product_profit_report',{p_from:from,p_to:to,p_branch:selectedBranchId==='all'?null:selectedBranchId,p_estimate:estimate});
      if(failure)throw new Error(failure.code==='PGRST202'?'Falta aplicar la migración de utilidad por producto en este entorno.':failure.message);
      setResult(normalizeProfit(data));setRequestKey(key);
    } catch(e){setError((e as Error).message);setResult(null);}finally{setBusy(false);}
  }
  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold">Utilidad por producto</h2><p className="text-sm text-muted-foreground">Ventas netas, costos y margen bruto. Los costos desconocidos permanecen visibles como pendientes.</p></div>
    <CatalogCosts organizationId={user.organization_id} onSaved={()=>{setResult(null);return Promise.resolve();}}/>
    <Card className="p-5 space-y-4 rounded-2xl">
      <div className="flex gap-2 flex-wrap"><Button variant="outline" size="sm" disabled={busy} onClick={()=>{const day=format(new Date(),'yyyy-MM-dd');setFrom(day);setTo(day);}}>Hoy</Button><Button variant="outline" size="sm" disabled={busy} onClick={()=>{const month=subMonths(new Date(),1);setFrom(format(startOfMonth(month),'yyyy-MM-dd'));setTo(format(endOfMonth(month),'yyyy-MM-dd'));}}>Mes anterior</Button><Button variant="outline" size="sm" disabled={busy} onClick={()=>{setFrom(format(startOfMonth(new Date()),'yyyy-MM-dd'));setTo(format(new Date(),'yyyy-MM-dd'));}}>Este mes</Button></div>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label htmlFor="profit-from">Desde</Label><Input id="profit-from" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div>
        <div><Label htmlFor="profit-to">Hasta</Label><Input id="profit-to" type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>
        <div><Label htmlFor="profit-mode">Cálculo de costos</Label><select id="profit-mode" className={selectClass} value={estimate?'estimated':'historical'} onChange={e=>setEstimate(e.target.value==='estimated')}><option value="historical">Histórico respaldado</option><option value="estimated">Estimar faltantes con costo actual</option></select></div>
        <div className="self-end"><Button className="w-full" disabled={busy||!from||!to||to<from} onClick={consult}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Search className="mr-2 h-4 w-4"/>}Consultar</Button></div>
      </fieldset>
      <p className="text-xs text-muted-foreground">Sede: {selectedBranchId==='all'?'Todas las sedes':getBranchName(selectedBranchId)}. Se utiliza la sede de venta; el almacén de abastecimiento se conserva en el detalle. Ambos días están incluidos.</p>
      {to<from&&<p role="alert" className="text-sm text-red-700">Hasta debe ser igual o posterior a Desde.</p>}
      {estimate&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Estimación: para costos históricos faltantes se usará el costo comparable confirmado actual del producto, solo si coincide con la moneda del comprobante. Los documentos sin moneda histórica siguen pendientes.</p>}
    </Card>
    {error&&<p role="alert" className="rounded-lg border border-red-300 p-4 text-red-700">{error}</p>}
    {stale&&<p role="status" className="bg-amber-50 text-amber-950 p-3 rounded-lg">Los filtros cambiaron. Pulsa Consultar para actualizar los resultados y habilitar la exportación.</p>}
    {result&&!stale&&<>
      <p className="rounded-xl border p-4 text-sm">Abre un producto para confirmar su costo comparable. Se conservará en nuevas ventas; no modifica costos históricos. Las notas pendientes deben vincularse y clasificarse antes de incluirlas en los totales.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div><Label htmlFor="profit-search">Producto o código</Label><Input id="profit-search" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Buscar producto…"/></div>
        <div><Label htmlFor="profit-channel">Canal</Label><select id="profit-channel" className={selectClass} value={channel} onChange={e=>{setChannel(e.target.value);setPage(0);}}><option value="all">Todos los canales</option>{Object.entries(channels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
        <div><Label htmlFor="profit-category">Categoría actual</Label><select id="profit-category" className={selectClass} value={category} onChange={e=>{setCategory(e.target.value);setPage(0);}}><option value="all">Todas</option>{[...new Set(result.lines.map(l=>l.category).filter(Boolean))].map(c=><option key={c} value={c!}>{c}</option>)}</select></div>
        <div><Label htmlFor="profit-currency">Moneda</Label><select id="profit-currency" className={selectClass} value={currency} onChange={e=>{setCurrency(e.target.value);setPage(0);}}><option value="all">Todas (sin mezclar)</option>{[...new Set(result.lines.map(l=>l.currency||'unknown'))].map(c=><option key={c} value={c}>{c==='unknown'?'Sin moneda histórica':c}</option>)}</select></div>
        <div><Label htmlFor="profit-quality">Calidad del costo</Label><select id="profit-quality" className={selectClass} value={quality} onChange={e=>{setQuality(e.target.value);setPage(0);}}><option value="all">Todas</option>{Object.entries(qualities).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
      </div>
      <div className="flex justify-between items-center gap-3 flex-wrap"><Button variant="ghost" onClick={()=>{setSearch('');setChannel('all');setCategory('all');setCurrency('all');setQuality('all');setPage(0);}}>Limpiar filtros de resultados</Button>
        <Button variant="outline" disabled={busy||!filtered.length} onClick={()=>downloadProfit(filtered,{Desde:from,Hasta:to,Sede:selectedBranchId==='all'?'Todas':getBranchName(selectedBranchId),Canal:channel,Categoría:category,Moneda:currency,Calidad:quality,Búsqueda:search,Modo:estimate?'Estimación explícita':'Histórico',Consulta:result.generated_at,Generado:new Date().toISOString()})}><Download className="mr-2 h-4 w-4"/>Exportar Excel</Button></div>
      {totals.map(t=><Card key={t.currency} className="p-4 rounded-xl"><p className="font-semibold mb-3">{t.currency} {t.pending>0?'· Resultado parcial':''} {estimate?'· Incluye estimaciones':''}</p><div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{[
        ['Venta neta',t.currency==='Sin moneda'?'Moneda pendiente':money(t.revenue)],['Costo conocido',t.known?money(t.cost):'Pendiente'],['Utilidad calculable',t.known?money(t.profit):'Pendiente'],['Margen calculable',t.knownRevenue>0?`${decimal(t.profit/t.knownRevenue*100)} %`:'No aplica'],['Líneas pendientes',String(t.pending)],
      ].map(([label,value])=><div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold tabular-nums">{value}</p></div>)}</div></Card>)}
      <p role="status" className="text-sm text-muted-foreground">{groups.length} productos por moneda · {filtered.length} líneas consultadas · {filtered.filter(l=>l.operation==='unassigned').length} ajustes pendientes fuera de los totales.</p>
      {!groups.length?<Card className="p-10 text-center text-muted-foreground">No hay operaciones para estos filtros.</Card>:<div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted"><tr>{['Producto / código','Unidades netas','Venta neta','Precio promedio','Costo promedio','Costo conocido','Utilidad / unidad','Utilidad calculable','Margen %','Calidad'].map(h=><th key={h} className="p-3 text-left whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{groups.slice(page*25,(page+1)*25).map(g=>{
        const a=profitAverages(g);const known=g.lines.some(l=>l.quality!=='pending');
        return <ProductRows key={g.key} group={g} averages={a} known={known} open={expanded===g.key} refresh={consult} toggle={()=>setExpanded(expanded===g.key?null:g.key)}/>;
      })}</tbody></table></div>}
      {groups.length>25&&<div className="flex justify-end items-center gap-3"><Button variant="outline" disabled={!page} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span>{page+1} / {Math.ceil(groups.length/25)}</span><Button variant="outline" disabled={(page+1)*25>=groups.length} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>}
    </>}
    {!result&&!busy&&!error&&<Card className="p-10 text-center text-muted-foreground">Selecciona el período y consulta la utilidad de tus productos.</Card>}
    <details className="text-sm border rounded-xl p-4"><summary className="font-medium cursor-pointer">Cómo se calcula y qué queda pendiente</summary><ul className="list-disc pl-5 mt-3 space-y-2">{PROFIT_RULES.map(rule=><li key={rule}>{rule}</li>)}</ul></details>
  </div>;
}

function ProductRows({group:g,averages:a,known,open,toggle,refresh}:{group:ReturnType<typeof groupProfit>[number];averages:ReturnType<typeof profitAverages>;known:boolean;open:boolean;toggle:()=>void;refresh:()=>Promise<void>}) {
  return <><tr className="border-t hover:bg-muted/30"><td className="p-3 min-w-52"><button className="text-left font-medium underline underline-offset-4" aria-expanded={open} onClick={toggle}>{g.name}</button><p className="text-xs text-muted-foreground">{g.sku} · {g.unit} · {g.currency}</p></td>{[decimal(g.quantity),g.currency==='Sin moneda'?'—':money(g.revenue),money(a.price),money(a.cost),known?money(g.cost):'—',money(a.profit),known?money(g.profit):'—',a.margin===null?'—':`${decimal(a.margin*100)} %`].map((v,i)=><td key={i} className={`p-3 text-right tabular-nums whitespace-nowrap ${i===6&&g.profit<0?'text-red-700 font-semibold':''}`}>{v}</td>)}<td className="p-3 whitespace-nowrap">{g.pending?`${g.pending} pendientes`:g.estimated?'Estimado':'Histórico'}{g.pending>0&&g.estimated>0&&<p className="text-xs">{g.estimated} estimadas</p>}</td></tr>
    {open&&<tr><td colSpan={10} className="bg-muted/20 p-4"><p className="font-semibold mb-3">Operaciones que componen el resultado</p><table className="w-full text-xs"><thead><tr>{['Comprobante','Emisión','Operación','Unidades','Venta neta','Costo','Procedencia / entorno'].map(h=><th key={h} className="text-left p-2">{h}</th>)}</tr></thead><tbody>{g.lines.map(l=><tr key={l.id} className="border-t"><td className="p-2">{l.document}<p>{channels[l.channel||'']||'Canal no registrado'}</p></td><td className="p-2 whitespace-nowrap">{formatDate(l.date)}</td><td className="p-2">{operations[l.operation]}</td><td className="p-2">{decimal(l.quantity)}</td><td className="p-2">{money(l.revenue)}</td><td className="p-2">{money(l.cost)}</td><td className="p-2">{l.cost_source}<p>Entorno: {l.environment||'desconocido'}</p></td></tr>)}</tbody></table>
      {g.lines[0].product_id&&<ConfirmProductCost productId={g.lines[0].product_id} refresh={refresh}/>}
      {g.lines.filter(l=>l.operation==='unassigned').map(l=><ReviewProfitNote key={l.id} line={l} refresh={refresh}/>)}
    </td></tr>}
  </>;
}

function ConfirmProductCost({productId,refresh}:{productId:string;refresh:()=>Promise<void>}) {
  const [cost,setCost]=useState('');const [currency,setCurrency]=useState('PEN');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function save(){
    setBusy(true);setError('');
    try{const {error:failure}=await supabase.rpc('confirm_profit_cost',{p_product:productId,p_cost:Math.round(Number(cost)*100),p_currency:currency});if(failure)throw new Error(failure.message);showSuccess('Costo confirmado para nuevas ventas. Los costos históricos se conservan.');await refresh();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <details className="border rounded-lg p-3 mt-4"><summary className="cursor-pointer font-medium">Confirmar costo comparable para futuras ventas</summary><p className="text-sm my-3">Ingresa el costo unitario comparable con ventas sin IGV. Esta confirmación queda auditada y no modifica el precio ni el costo del catálogo. Cero significa costo cero confirmado.</p><fieldset disabled={busy} className="flex gap-3 flex-wrap items-end"><div><Label htmlFor={`cost-${productId}`}>Costo unitario</Label><Input id={`cost-${productId}`} type="number" min="0" max="100000000" step="0.01" value={cost} onChange={e=>setCost(e.target.value)}/></div><div><Label htmlFor={`currency-${productId}`}>Moneda del costo</Label><select id={`currency-${productId}`} className={selectClass} value={currency} onChange={e=>setCurrency(e.target.value)}><option>PEN</option><option>USD</option></select></div><Button disabled={busy||cost.trim()===''||!Number.isFinite(Number(cost))||Number(cost)<0} onClick={save}>Confirmar costo</Button></fieldset>{error&&<p role="alert" className="text-red-700 mt-2">{error}</p>}</details>;
}

function ReviewProfitNote({line,refresh}:{line:ProfitLine;refresh:()=>Promise<void>}) {
  const [original,setOriginal]=useState('');const [effect,setEffect]=useState('price');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function save(){setBusy(true);setError('');try{const {error:failure}=await supabase.rpc('review_profit_note',{p_item:line.id,p_original:original,p_effect:effect});if(failure)throw new Error(failure.message);showSuccess('Revisión registrada. Los movimientos de stock no fueron modificados.');await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <details className="border border-amber-300 rounded-lg p-3 mt-4"><summary className="cursor-pointer font-medium">Revisar nota {line.document}</summary><p className="text-sm my-3">Vincula la línea original y confirma el efecto económico. Esta revisión no mueve stock; verifica por separado la devolución física. No clasifiques diferencias de cantidad como ajustes de precio.</p><fieldset disabled={busy} className="flex gap-3 flex-wrap"><div><Label htmlFor={`original-${line.id}`}>Línea original</Label><select id={`original-${line.id}`} className={selectClass} value={original} onChange={e=>setOriginal(e.target.value)}><option value="">Seleccionar línea</option>{line.candidates?.map(c=><option key={c.id} value={c.id}>{c.name} · {c.quantity} unidades · {c.id.slice(0,8)}</option>)}</select></div><div><Label htmlFor={`effect-${line.id}`}>Efecto</Label><select id={`effect-${line.id}`} className={selectClass} value={effect} onChange={e=>setEffect(e.target.value)}><option value="price">Ajuste de precio, sin devolución</option>{line.type==='nota_credito'&&<option value="return">Devolución física</option>}</select></div><Button className="self-end" disabled={busy||!original} onClick={save}>Guardar revisión</Button></fieldset>{error&&<p role="alert" className="text-red-700 mt-2">{error}</p>}</details>;
}

function CatalogCosts({organizationId,onSaved}:{organizationId:string;onSaved:()=>Promise<void>}) {
  const [search,setSearch]=useState('');const [products,setProducts]=useState<Array<{id:string;name:string;sku:string}>>([]);
  const [selected,setSelected]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [queried,setQueried]=useState(false);
  async function find(){setBusy(true);setError('');setSelected('');try{
    const {data,error:failure}=await supabase.from('products').select('id,name,sku').eq('organization_id',organizationId).ilike('name',`%${search.replace(/[%_]/g,'')}%`).order('name').limit(50);
    if(failure)throw new Error(failure.message);setProducts(data||[]);setQueried(true);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <details className="rounded-xl border p-4 text-sm"><summary className="font-medium cursor-pointer">Preparar costos antes de vender</summary><p className="my-3 text-muted-foreground">Confirma el costo comparable de un producto, aunque todavía no tenga ventas. Las nuevas ventas conservarán este costo; las anteriores no se completan retroactivamente.</p><div className="flex gap-3"><Input aria-label="Nombre del producto para confirmar costo" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre del producto"/><Button variant="outline" disabled={busy||search.trim().length<2} onClick={find}>Buscar producto</Button></div>{queried&&<p className="mt-2">{products.length} resultados (máximo 50; afina la búsqueda si es necesario).</p>}{products.length>0&&<select aria-label="Producto para confirmar costo" className={`${selectClass} mt-3`} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Seleccionar producto</option>{products.map(p=><option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select>}{selected&&<ConfirmProductCost key={selected} productId={selected} refresh={onSaved}/ >}{error&&<p role="alert" className="text-red-700">{error}</p>}</details>;
}
