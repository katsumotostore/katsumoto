import { useState } from 'react';
import { useBranches } from '@/hooks/useBranches';
import { supabase } from '@/lib/supabase';
import { inspectAccountingInvoice, ACCOUNTING_PENDING_RULES, type AccountingInvoice } from '@/lib/accounting-report';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountingWorkbook, buildAccountingDraft, downloadAccountingDraft, ACCOUNTING_DRAFT_RULES } from '@/lib/accounting-export';

const amount = (cents: number) => (cents / 100).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
export function AccountingReportDialog({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}) {
  const {branches} = useBranches();
  const [from,setFrom] = useState('');
  const [to,setTo] = useState('');
  const [branch,setBranch] = useState('all');
  const [rows,setRows] = useState<ReturnType<typeof inspectAccountingInvoice>[]>([]);
  const [reviewed,setReviewed] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [page,setPage] = useState(0);
  const [exportId,setExportId] = useState('');
  const [reviewedAt,setReviewedAt] = useState('');
  const clear = () => {setRows([]);setReviewed(false);setPage(0);setError('');setExportId('');};
  async function review() {
    clear();setBusy(true);
    try {
      const {data,error:failure} = await supabase.rpc('accounting_report_source',{p_from:from,p_to:to,p_branch:branch==='all'?null:branch});
      if (failure) throw new Error(failure.code==='PGRST202'?'Falta aplicar la migración del reporte contable en este entorno.':failure.message);
      setRows((data as AccountingInvoice[]).map(inspectAccountingInvoice));setReviewed(true);setReviewedAt(new Date().toISOString());setExportId('');
    } catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function download() {
    setBusy(true);setError('');
    try {
      const draft=buildAccountingDraft(rows.map(row=>row.invoice));
      const metadata={Desde:from,Hasta:to,Sede:branch==='all'?'Todas las sedes':branches.find(b=>b.id===branch)?.name||branch,Consulta:reviewedAt,Generado:new Date().toISOString(),Version:'0.2 preliminar',Entornos:'Incluye beta y desconocidos; consultar Observaciones'};
      const {data:id,error:failure}=await supabase.rpc('save_accounting_export',{p_filters:{...metadata,branch_id:branch,rules:ACCOUNTING_DRAFT_RULES,observations:draft.observations,invoice_ids:rows.map(row=>row.invoice.id)},p_report:draft.rows});
      if(failure)throw new Error(`No se pudo registrar la exportación: ${failure.message}`);
      setExportId(String(id));
      downloadAccountingDraft(accountingWorkbook(draft,{...metadata,'Registro de exportación':String(id)}),`BORRADOR_Reporte_Contable_${from}_${to}.xlsx`);
    } catch(e){setError((e as Error).message);} finally {setBusy(false);}
  }
  return <Dialog open={open} onOpenChange={value=>{if(!busy){onOpenChange(value);if(!value)clear();}}}>
    <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Reporte contable · borrador para el contador</DialogTitle><DialogDescription>Descarga las 35 columnas con la data actual y hojas de observaciones y criterios. No es un archivo definitivo ni apto para cargar directamente a SUNAT.</DialogDescription></DialogHeader>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-3">
        <div><Label htmlFor="accounting-from">Desde</Label><Input id="accounting-from" type="date" value={from} onChange={e=>{setFrom(e.target.value);clear();}}/></div>
        <div><Label htmlFor="accounting-to">Hasta</Label><Input id="accounting-to" type="date" value={to} onChange={e=>{setTo(e.target.value);clear();}}/></div>
        <div><Label htmlFor="accounting-branch">Sede</Label><select id="accounting-branch" className="border rounded-md w-full p-2 bg-background" value={branch} onChange={e=>{setBranch(e.target.value);clear();}}><option value="all">Todas las sedes</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      </fieldset>
      <p className="text-sm text-muted-foreground">Incluye facturas, boletas, notas y anulados. Excluye borradores. No utiliza la paginación de la tabla de Facturación.</p>
      <Button disabled={busy||!from||!to||to<from} onClick={review}>{busy?'Consultando período…':'Revisar comprobantes'}</Button>
      {error&&<p role="alert" className="text-red-700">{error}</p>}
      {reviewed&&<>
        <p role="status" className="font-medium">{rows.length} comprobantes · {rows.filter(r=>r.issues.length).length} con observaciones</p>
        <p className="text-sm">Los importes conservan el signo guardado. No se presenta un total neto hasta definir el tratamiento de notas y anulaciones.</p>
        <div className="overflow-auto max-h-80 border rounded-lg"><table className="w-full text-sm"><thead className="bg-muted"><tr>{['Comprobante','Receptor','Total / moneda','SUNAT','Observaciones'].map(h=><th className="text-left p-3" key={h}>{h}</th>)}</tr></thead><tbody>{rows.slice(page*50,(page+1)*50).map(r=><tr key={r.invoice.id} className="border-t"><td className="p-3 whitespace-nowrap">{r.invoice.serie}-{r.invoice.correlativo}<p className="text-xs">{r.invoice.issue_date} · {r.invoice.status}</p></td><td className="p-3">{r.invoice.accounting_identity?.name||r.invoice.customer?.name||'Sin receptor'}{!r.invoice.accounting_identity&&<p className="text-xs text-amber-700">Ficha actual; dato histórico pendiente</p>}</td><td className="p-3">{amount(r.invoice.total_cents)} {r.invoice.accounting_currency||'(sin moneda histórica)'}</td><td className="p-3">{r.sunat}</td><td className="p-3">{r.issues.length?<details><summary className="cursor-pointer text-amber-800">{r.issues.length} observaciones</summary><ul className="list-disc pl-4">{r.issues.map(i=><li key={i}>{i}</li>)}</ul></details>:'Sin diferencias detectadas'}</td></tr>)}</tbody></table></div>
        {rows.length>50&&<div className="flex justify-end gap-3"><Button variant="outline" disabled={!page} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span>{page+1} / {Math.ceil(rows.length/50)}</span><Button variant="outline" disabled={(page+1)*50>=rows.length} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>}
      </>}
      <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-950 p-4 text-sm"><strong>Pendiente de confirmar con el contador</strong><ul className="list-disc pl-5 mt-2 space-y-1">{ACCOUNTING_PENDING_RULES.map(rule=><li key={rule}>{rule}</li>)}</ul></div>
      {exportId&&<p role="status" className="text-sm">Borrador registrado: {exportId}. Conserva el archivo junto con las observaciones para revisarlo con el contador.</p>}
      <div className="flex justify-end gap-2"><Button disabled={busy||!reviewed||!rows.length} onClick={download}>{busy?'Procesando…':'Descargar Excel preliminar'}</Button><Button variant="outline" disabled={busy} onClick={()=>{clear();onOpenChange(false);}}>Cerrar</Button></div>
    </DialogContent>
  </Dialog>;
}
