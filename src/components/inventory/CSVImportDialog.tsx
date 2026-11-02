import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBranches } from '@/hooks/useBranches';
import { useAuth } from '@/lib/auth-context';
import { downloadProductTemplate, readProductFile, type ImportRow, type ImportResult } from '@/lib/product-import';
import { productImportService, type ImportOptions } from '@/services/product-import.service';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';

const labels={created:'Nuevo',updated:'Actualizar',skipped:'Omitido',error:'Error'};
const money=(value:unknown)=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Number(value||0)/100);
function ProductPreview({result}:{result:ImportResult}) {
  if(!['created','updated'].includes(result.status))return null;
  return <details className="mt-1"><summary className="cursor-pointer text-orange-700">Ver producto y precios</summary><div className="space-y-1 py-2 text-xs">
    <p>{String(result.after?.category||'')} · {String(result.after?.unit||'')} · IGV: {String(result.after?.tax_affectation||'')}</p>
    <p>Precio: <strong>{money(result.after?.price_cents)}</strong> · Costo: {money(result.after?.cost_cents)}</p>
    {result.tiers?.map((tier,i)=>{const t=tier as {label:string;min_quantity:number;price_cents:number};return <p key={i}>{t.label}: desde {t.min_quantity} unidades a {money(t.price_cents)}</p>;})}
  </div></details>;
}
const fieldNames: Record<string,string>={name:'Nombre',product_family:'Familia',category_group:'Grupo',category:'Categoría',unit:'Unidad',price_cents:'Precio (céntimos)',cost_cents:'Costo (céntimos)',min_stock:'Stock mínimo',max_stock:'Stock máximo',tax_affectation:'IGV',supplier:'Proveedor',tags:'Etiquetas',description:'Descripción',image_url:'Imagen'};
export function CSVImportDialog({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}) {
  const {branches}=useBranches(),{user}=useAuth(),queryClient=useQueryClient();
  const [rows,setRows]=useState<ImportRow[]>([]),[preview,setPreview]=useState<ImportResult[]>([]),[results,setResults]=useState<ImportResult[]>([]);
  const [file,setFile]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0);
  const [branch,setBranch]=useState(''),[mode,setMode]=useState<'create'|'update'>('create'),[replace,setReplace]=useState(false);
  const [confirmed,setConfirmed]=useState(false),[filter,setFilter]=useState('all'),[attempted,setAttempted]=useState(false),[page,setPage]=useState(0);
  const batch=useRef(crypto.randomUUID());
  const physical=branches.filter(b=>b.is_active&&b.type!=='online'&&!b.stock_source_branch_id);
  const permitted=!!user&&['owner','admin','inventory'].includes(user.role);
  useEffect(()=>{if(open&&!branch){const central=branches.find(b=>b.is_active&&b.type==='warehouse'&&!b.stock_source_branch_id&&b.is_default)||branches.find(b=>b.is_active&&b.type==='warehouse'&&!b.stock_source_branch_id);if(central)setBranch(central.id);}},[open,branches,branch]);
  const reset=()=>{setRows([]);setPreview([]);setResults([]);setFile('');setError('');setConfirmed(false);setAttempted(false);setProgress(0);setPage(0);setFilter('all');batch.current=crypto.randomUUID();};
  const invalidate=()=>{setPreview([]);setResults([]);setConfirmed(false);setPage(0);};
  const options:ImportOptions={branchId:branch,batchId:batch.current,mode,replaceTiers:replace};
  const load=async(f?:File)=>{if(!f)return;reset();setBusy(true);try{setRows(await readProductFile(f));setFile(f.name);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const validate=async()=>{setBusy(true);setError('');setProgress(0);setConfirmed(false);setPage(0);try{const local=rows.filter(r=>r.errors.length).map(r=>({row:r.row,sku:r.sku,status:'error' as const,message:r.errors.join('; ')}));const remote=await productImportService.run(rows.filter(r=>!r.errors.length),options,false,[],setProgress);setPreview([...local,...remote].sort((a,b)=>a.row-b.row));}catch(e){setPreview([]);setError((e as Error).message);}finally{setBusy(false);}};
  const apply=async()=>{setBusy(true);setAttempted(true);setError('');setProgress(0);try{setResults(await productImportService.run(rows,options,true,preview,setProgress));}catch(e){setError(`${(e as Error).message}. Si la conexión se interrumpió, usa Reintentar mismo lote: las filas ya confirmadas no vuelven a sumar stock.`);}finally{await queryClient.invalidateQueries();setBusy(false);}};
  const template=async()=>{setBusy(true);setError('');try{await downloadProductTemplate(await productImportService.catalogs());}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const downloadReport=()=>{
    const report=(results.length?results:preview).map(r=>({fila:r.row,sku:r.sku,estado:labels[r.status],mensaje:r.message||'',producto:r.product_id||''}));
    const escape=(v:unknown)=>`"${String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')}"`;
    const text='\uFEFF'+['fila,sku,estado,mensaje,producto',...report.map(r=>Object.values(r).map(escape).join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='resultado_importacion.csv';a.click();URL.revokeObjectURL(url);
  };
  const displayed=results.length?results:preview, errors=displayed.filter(r=>r.status==='error').length;
  const ready=preview.length===rows.length&&rows.length>0&&!preview.some(r=>r.status==='error');
  const filtered=displayed.filter(r=>filter==='all'||r.status===filter);
  const environment=new URL(import.meta.env.VITE_SUPABASE_URL).hostname;
  return <Dialog open={open} onOpenChange={v=>{if(!busy){onOpenChange(v);if(!v)reset();}}}>
    <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" onInteractOutside={e=>{if(busy||attempted)e.preventDefault();}} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}}>
      <DialogHeader><DialogTitle>Importar productos</DialogTitle><DialogDescription>Excel o CSV · Revisión antes de guardar · Stock en una sede física</DialogDescription></DialogHeader>
      {!permitted?<p role="alert">Necesitas rol propietario, administrador o inventario para importar.</p>:<>
      <ol className="flex gap-4 text-sm font-medium"><li className={!preview.length?'text-orange-600':''}>1. Subir</li><li className={preview.length&&!attempted?'text-orange-600':''}>2. Revisar</li><li className={attempted?'text-orange-600':''}>3. Importar</li></ol>
      <p className="text-xs text-muted-foreground">Backend: {environment} · Plantilla v1 · Máximo 5 MB / 5.000 productos</p>
      <fieldset disabled={busy||attempted} className="space-y-4 disabled:opacity-60">
        <div className="flex flex-wrap items-center gap-3"><Button variant="outline" onClick={template}><Download className="mr-2 h-4 w-4"/>Descargar plantilla actual</Button><Label htmlFor="product-import-file" className="sr-only">Archivo de productos</Label><Input id="product-import-file" type="file" accept=".xlsx,.csv" className="max-w-sm" onChange={e=>{void load(e.target.files?.[0]);e.target.value='';}}/></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="import-branch">Almacén del stock inicial</Label><select id="import-branch" className="w-full border rounded-md p-2 bg-background" value={branch} onChange={e=>{setBranch(e.target.value);invalidate();}}><option value="">Selecciona una sede física</option>{physical.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><Label htmlFor="import-mode">Qué hacer con los SKU existentes</Label><select id="import-mode" className="w-full border rounded-md p-2 bg-background" value={mode} onChange={e=>{setMode(e.target.value as 'create'|'update');setReplace(false);invalidate();}}><option value="create">Crear nuevos y omitir existentes</option><option value="update">Crear nuevos y actualizar existentes</option></select></div></div>
        {mode==='update'&&<div className="rounded-lg bg-amber-50 text-amber-950 p-3 text-sm"><p>Los campos vacíos conservan sus valores. En productos existentes, deja stock inicial vacío o en cero.</p><label className="flex gap-2 mt-2"><input type="checkbox" checked={replace} onChange={e=>{setReplace(e.target.checked);invalidate();}}/>Reemplazar todas las escalas de los productos actualizados. Si un SKU no tiene escalas en el archivo, se eliminarán sus escalas actuales.</label></div>}
      </fieldset>
      {file&&<p className="text-sm flex items-center gap-2"><FileSpreadsheet className="h-4 w-4"/>{file} · {rows.length} productos · {rows.reduce((n,r)=>n+r.tiers.length,0)} escalas</p>}
      {error&&<div role="alert" className="rounded-lg bg-red-50 text-red-800 p-3 text-sm flex gap-2"><AlertCircle className="h-5 w-5 shrink-0"/>{error}</div>}
      {!!displayed.length&&<>
        <div className="flex flex-wrap gap-2">{Object.entries(labels).map(([key,label])=><Button key={key} size="sm" variant={filter===key?'default':'outline'} onClick={()=>{setFilter(key);setPage(0);}}>{label}: {displayed.filter(r=>r.status===key).length}</Button>)}<Button size="sm" variant="ghost" onClick={()=>{setFilter('all');setPage(0);}}>Todos</Button><Button size="sm" variant="outline" onClick={downloadReport}><Download className="h-4 w-4 mr-1"/>Informe</Button></div>
        <div className="border rounded-lg overflow-auto max-h-80"><table className="w-full text-sm"><thead className="bg-muted sticky top-0"><tr>{['Fila Excel','SKU / producto','Estado','Detalle'].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{filtered.slice(page*50,(page+1)*50).map(r=><tr key={r.row} className="border-t"><td className="p-3">{r.row}</td><td className="p-3"><span className="font-mono">{r.sku}</span><p className="text-xs text-muted-foreground">{String(r.after?.name||'')}</p></td><td className={`p-3 ${r.status==='error'?'text-red-700':''}`}>{labels[r.status]}</td><td className="p-3">{r.message|| (r.status==='created'?`Stock inicial: ${r.stock} · ${r.tiers?.length||0} escalas`:r.status==='skipped'?'Ya existe; no se modifica':'Stock sin cambios')}{r.status==='updated'&&<details><summary className="cursor-pointer text-orange-700">Ver cambios</summary>{Object.keys(fieldNames).filter(k=>JSON.stringify(r.before?.[k])!==JSON.stringify(r.after?.[k])).map(k=><p key={k} className="text-xs break-all">{fieldNames[k]}: {String(r.before?.[k]??'—')} → {String(r.after?.[k]??'—')}</p>)}<p className="text-xs">Escalas: {replace?`reemplazar por ${r.tiers?.length||0}`:'conservar'}</p></details>}<ProductPreview result={r}/></td></tr>)}</tbody></table></div>
        {filtered.length>50&&<div className="flex items-center justify-end gap-3 text-sm"><Button size="sm" variant="outline" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</Button>{page+1} / {Math.ceil(filtered.length/50)}<Button size="sm" variant="outline" disabled={(page+1)*50>=filtered.length} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>}
      </>}
      {busy&&<div role="status" className="flex gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Procesando {progress} de {rows.length} filas… No cierres esta ventana.</div>}
      {ready&&!attempted&&<div className="rounded-lg border p-4 space-y-2 text-sm"><p>Se crearán {preview.filter(r=>r.status==='created').length} productos y se actualizarán {preview.filter(r=>r.status==='updated').length}. Entrada inicial: {preview.reduce((n,r)=>n+(r.stock||0),0)} unidades en <strong>{physical.find(b=>b.id===branch)?.name}</strong>.</p><p>Revisa los costos vacíos: en productos nuevos se guardan como cero. Las etiquetas se generan desde Imprimir etiquetas después de importar.</p><label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo el entorno, almacén y cambios revisados.</label></div>}
      {!!results.length&&!errors&&<p role="status" className="text-green-700 flex gap-2"><CheckCircle2 className="h-5 w-5"/>Lote completado. El inventario y el Kardex se han actualizado.</p>}
      {!!errors&&<p className="text-sm text-red-700">Corrige los errores antes de iniciar una nueva importación. El informe conserva las filas originales de Excel.</p>}
      <DialogFooter>
        {attempted&&<Button variant="outline" disabled={busy} onClick={reset}>Nuevo archivo / nueva revisión</Button>}
        {!attempted&&<Button variant="outline" disabled={busy||!rows.length||!branch} onClick={validate}><Upload className="h-4 w-4 mr-2"/>Revisar archivo</Button>}
        {ready&&(!results.length||errors>0)&&<Button disabled={busy||(!confirmed&&!attempted)} onClick={apply}>{attempted?'Reintentar mismo lote':'Confirmar importación'}</Button>}
        <Button variant="ghost" disabled={busy} onClick={()=>{reset();onOpenChange(false);}}>Cerrar</Button>
      </DialogFooter></>}
    </DialogContent>
  </Dialog>;
}
