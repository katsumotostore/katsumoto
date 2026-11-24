import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useManagedCatalog } from "@/hooks/useManagedCatalog";
import { useAuth } from "@/lib/auth-context";
import { getCurrentOrgId } from "@/lib/supabase";
import { categoryService } from "@/services/category.service";
import { productService } from "@/services/product.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ImageUpload } from "@/components/ImageUpload";
import { showError, showSuccess } from "@/utils/toast";
import { Plus, Pencil, Archive, ArrowRightLeft, FolderTree } from "lucide-react";

type Edit = { kind: "group" | "category"; id?: string; parent: string };
type Action = { kind: "archive" | "reassign" | "link"; id: string; name: string; node: "category" | "group"; family: string; count: number; active?: boolean };
const selectClass = "w-full rounded-lg border bg-background p-2 text-sm";
export function CategoryManager() {
  const { all, catalog, isLoading, error, refresh } = useManagedCatalog();
  const { user } = useAuth();
  const canManage = !!user && ["owner","admin","inventory"].includes(user.role);
  const { data: assignments = [], error: assignmentsError } = useQuery({ queryKey: ["catalog-assignments",getCurrentOrgId()], queryFn: () => categoryService.productAssignments(), enabled: canManage });
  const [search,setSearch] = useState("");
  const [showArchived,setShowArchived] = useState(false);
  const [edit,setEdit] = useState<Edit | null>(null);
  const [name,setName] = useState("");
  const [image,setImage] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [action,setAction] = useState<Action | null>(null);
  const [target,setTarget] = useState("");
  const count = (id: string) => assignments.filter(p => p.category_id === id).length;
  const familyForGroup = (id: string) => all.families.find(f => f.id === all.groups.find(g => g.id === id)?.familyId)?.key ?? "";
  const pending = assignments.filter(p => !p.category_id);
  const openEdit = (value: Edit, label = "", url: string | null = null) => { setEdit(value); setName(label); setImage(url); };
  const openAction = (value: Action) => { setAction(value); setTarget(""); };
  const save = async () => {
    if (!edit || !name.trim() || busy) return;
    setBusy(true);
    try {
      if (edit.kind === "group") {
        if (edit.id) await categoryService.updateGroup(edit.id,{label:name.trim()});
        else await categoryService.createGroup({familyId:edit.parent,key:`g_${crypto.randomUUID().replaceAll("-","")}`,label:name.trim()});
      } else {
        if (edit.id) await categoryService.updateCategory(edit.id,{name:name.trim(),imageUrl:image});
        else await categoryService.createCategory({groupId:edit.parent,name:name.trim(),imageUrl:image ?? undefined});
      }
      await refresh();setEdit(null);showSuccess("Catálogo actualizado");
    } catch(e) { showError((e as Error).message); } finally {setBusy(false);}
  };
  const apply = async () => {
    if (!action || busy) return;
    setBusy(true);
    try {
      if (action.kind === "archive") await categoryService.setActive(action.node,action.id,!action.active);
      else if (action.kind === "reassign") { if (!target) return; await categoryService.reassign(action.id,target); }
      else { if (!target) return; await productService.update(action.id,{category_id:target}); }
      await refresh();setAction(null);showSuccess("Cambio aplicado");
    } catch(e) {showError((e as Error).message);} finally {setBusy(false);}
  };
  if (isLoading) return <p role="status">Cargando catálogo administrado…</p>;
  if (error) return <div role="alert">No se pudo cargar el catálogo. <Button variant="outline" onClick={() => void refresh()}>Reintentar</Button></div>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-semibold flex items-center gap-2"><FolderTree className="h-5 w-5"/>Catálogo de productos y servicios</h2><p className="text-sm text-muted-foreground mt-1">Tipo de artículo → Grupo → Categoría. Una sola clasificación para inventario, POS, tienda e importaciones.</p></div>
      {canManage && <Button onClick={() => openEdit({kind:"group",parent:catalog.families[0]?.id ?? ""})}><Plus className="mr-2 h-4 w-4"/>Crear grupo</Button>}
    </div>
    <div className="rounded-xl bg-muted/40 p-4 text-sm">Productos y Servicios son tipos fijos. Renombrar conserva las asociaciones. Archivar retira una opción de nuevas asignaciones y conserva los artículos existentes.</div>
    {assignmentsError && <p role="alert" className="text-destructive">No se pudo consultar el uso de categorías. Recarga antes de gestionar asignaciones.</p>}
    {pending.length>0 && <div className="rounded-xl border border-amber-300 p-4 space-y-3"><h3 className="font-semibold">{pending.length} artículos pendientes de vincular</h3>{pending.map(p=><div key={p.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{p.sku} · {p.name} · {p.product_family} / {p.category_group} / {p.category}</span><Button size="sm" variant="outline" onClick={()=>openAction({kind:"link",id:p.id,name:p.name,node:"category",family:p.product_family,count:1})}>Asignar categoría</Button></div>)}</div>}
    {all.families.some(f=>!["productos","servicios"].includes(f.key)) && <p className="text-sm text-muted-foreground">Los tipos heredados no compatibles permanecen archivados para trazabilidad y no se ofrecen en productos.</p>}
    <div className="flex flex-wrap gap-4 items-center"><Input className="max-w-md" aria-label="Buscar grupo o categoría" placeholder="Buscar grupo o categoría…" value={search} onChange={e=>setSearch(e.target.value)}/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>Mostrar archivados</label></div>
    {catalog.families.map(f=><section key={f.id} className="space-y-3"><h3 className="font-semibold text-lg">{f.label}</h3>
      {all.groups.filter(g=>g.familyId===f.id&&(showArchived||g.isActive!==false)).filter(g=>!search||g.label.toLowerCase().includes(search.toLowerCase())||all.categories.some(c=>c.groupId===g.id&&c.name.toLowerCase().includes(search.toLowerCase()))).map(g=><div key={g.id} className="rounded-xl border overflow-hidden">
        <div className="bg-muted/40 p-4 flex flex-wrap justify-between items-center gap-3"><div><h4 className="font-semibold">{g.label} {g.isActive===false&&<span className="text-xs font-normal">· Archivado</span>}</h4><p className="text-xs text-muted-foreground">{all.categories.filter(c=>c.groupId===g.id).length} categorías</p></div>
          {canManage&&<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={g.isActive===false} onClick={()=>openEdit({kind:"category",parent:g.id})}><Plus className="h-4 w-4 mr-1"/>Categoría</Button><Button size="sm" variant="ghost" aria-label={`Renombrar grupo ${g.label}`} onClick={()=>openEdit({kind:"group",id:g.id,parent:f.id},g.label)}><Pencil className="h-4 w-4"/></Button><Button size="sm" variant="ghost" onClick={()=>openAction({kind:"archive",node:"group",id:g.id,name:g.label,family:f.key,count:assignments.filter(p=>all.categories.some(c=>c.groupId===g.id&&c.id===p.category_id)).length,active:g.isActive!==false})}>{g.isActive===false?"Restaurar":"Archivar grupo"}</Button></div>}
        </div>
        <div className="divide-y">{all.categories.filter(c=>c.groupId===g.id&&(showArchived||c.isActive!==false)&&(!search||g.label.toLowerCase().includes(search.toLowerCase())||c.name.toLowerCase().includes(search.toLowerCase()))).map(c=><div key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{c.name} {c.isActive===false&&<span className="text-xs text-muted-foreground">· Archivada</span>}</p><p className="text-sm text-muted-foreground">{count(c.id)} artículos vinculados, incluidos inactivos</p></div>{canManage&&<div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" disabled={c.isActive===false||g.isActive===false} aria-label={`Editar categoría ${c.name}`} onClick={()=>openEdit({kind:"category",id:c.id,parent:g.id},c.name,c.imageUrl)}><Pencil className="h-4 w-4"/></Button>
          <Button size="sm" variant="outline" disabled={!!assignmentsError} onClick={()=>openAction({kind:"reassign",node:"category",id:c.id,name:c.name,family:f.key,count:count(c.id)})}><ArrowRightLeft className="h-4 w-4 mr-1"/>Reasignar</Button>
          <Button size="sm" variant="ghost" disabled={g.isActive===false} onClick={()=>openAction({kind:"archive",node:"category",id:c.id,name:c.name,family:f.key,count:count(c.id),active:c.isActive!==false})}><Archive className="h-4 w-4 mr-1"/>{c.isActive===false?"Restaurar":"Archivar"}</Button>
        </div>}</div>)}</div>
        {!all.categories.some(c=>c.groupId===g.id)&&<p className="p-4 text-sm text-muted-foreground">Crea la primera categoría de este grupo.</p>}
      </div>)}
    </section>)}
    <Dialog open={!!edit} onOpenChange={open=>{if(!open&&!busy)setEdit(null);}}><DialogContent><DialogHeader><DialogTitle>{edit?.id?"Editar":"Crear"} {edit?.kind==="group"?"grupo":"categoría"}</DialogTitle><DialogDescription>Los artículos conservan su vínculo cuando cambias el nombre.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={e=>{e.preventDefault();void save();}}>
        {edit?.kind==="group"&&!edit.id&&<><Label htmlFor="catalog-type">Tipo de artículo</Label><select id="catalog-type" className={selectClass} value={edit.parent} onChange={e=>setEdit({...edit,parent:e.target.value})}>{catalog.families.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></>}
        <Label htmlFor="catalog-name">Nombre</Label><Input id="catalog-name" autoFocus value={name} maxLength={100} onChange={e=>setName(e.target.value)}/>
        {edit?.kind==="category"&&<ImageUpload value={image} onChange={setImage} compact/>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={()=>setEdit(null)}>Cancelar</Button><Button type="submit" disabled={busy||!name.trim()||!edit?.parent}>{busy?"Guardando…":"Guardar"}</Button></div>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!action} onOpenChange={open=>{if(!open&&!busy)setAction(null);}}><DialogContent><DialogHeader><DialogTitle>{action?.kind==="archive"?(action.active?"Archivar":"Restaurar"):"Reasignar clasificación"}</DialogTitle><DialogDescription>{action?.name} · {action?.count} artículos vinculados.</DialogDescription></DialogHeader>
      {action?.kind==="archive"?<p className="text-sm">{action.active?"Los artículos conservan su clasificación. Esta opción dejará de ofrecerse en nuevas asignaciones; si es un grupo, también sus categorías.":"Volverá a estar disponible para nuevas asignaciones."}</p>:<div className="space-y-3"><p className="text-sm">{action?.kind==="reassign"?"Se trasladarán todos los artículos, incluidos inactivos, al destino y se archivará la categoría de origen. No cambia precios, stock ni comprobantes históricos.":"Selecciona el destino de este artículo."}</p><Label htmlFor="catalog-target">Categoría destino</Label><select id="catalog-target" className={selectClass} value={target} onChange={e=>setTarget(e.target.value)}><option value="">Selecciona un destino</option>{catalog.categories.filter(c=>c.id!==action?.id&&familyForGroup(c.groupId)===action?.family).map(c=><option key={c.id} value={c.id}>{catalog.groups.find(g=>g.id===c.groupId)?.label} / {c.name}</option>)}</select></div>}
      <div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={()=>setAction(null)}>Cancelar</Button><Button disabled={busy||(action?.kind!=="archive"&&!target)} onClick={()=>void apply()}>{busy?"Aplicando…":"Confirmar cambio"}</Button></div>
    </DialogContent></Dialog>
  </div>;
}
